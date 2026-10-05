import Foundation
import JavaScriptCore

/// Runs only our bundled, pure rules. No page JavaScript, network or DOM is exposed.
/// Access is serialized because resolvers and UI naming can use different actors.
final class SharedCore: @unchecked Sendable {
    static let shared = SharedCore()
    private let lock = NSLock()
    private let suppliedScript: String?
    private var context: JSContext?

    // Script injection is for local fixture tests, not for web content.
    init(script: String? = nil) { suppliedScript = script }

    private struct Reply<Value: Decodable>: Decodable {
        let ok: Bool
        let value: Value?
        let error: String?
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private func loadedContext() throws -> JSContext {
        if let context { return context }
        let script: String
        if let suppliedScript {
            script = suppliedScript
        } else {
            guard let url = Bundle.main.url(forResource: "rg-shared-rules", withExtension: "js"),
                  let contents = try? String(contentsOf: url, encoding: .utf8) else {
                throw Failure(message: "CORE00: shared rules bundle is missing")
            }
            script = contents
        }
        guard let runtime = JSContext() else { throw Failure(message: "CORE00: shared runtime unavailable") }
        runtime.evaluateScript(script)
        guard runtime.exception == nil,
              let api = runtime.objectForKeyedSubscript("RG_NATIVE_CORE"), !api.isUndefined else {
            throw Failure(message: "CORE00: shared rules could not be loaded")
        }
        context = runtime
        return runtime
    }

    func decode<Value: Decodable>(_ type: Value.Type, operation: String, input: Any) throws -> Value {
        let data = try JSONSerialization.data(withJSONObject: input, options: [.fragmentsAllowed, .sortedKeys])
        guard let json = String(data: data, encoding: .utf8) else {
            throw Failure(message: "CORE01: invalid shared input")
        }
        lock.lock()
        defer { lock.unlock() }
        let runtime = try loadedContext()
        runtime.exception = nil
        // Inputs are arguments, never concatenated into executable JavaScript.
        guard let api = runtime.objectForKeyedSubscript("RG_NATIVE_CORE"),
              let function = api.forProperty("call"),
              let result = function.call(withArguments: [operation, json]),
              runtime.exception == nil, let encoded = result.toString(),
              let replyData = encoded.data(using: .utf8) else {
            throw Failure(message: "CORE01: shared rules failed")
        }
        let reply = try JSONDecoder().decode(Reply<Value>.self, from: replyData)
        guard reply.ok, let value = reply.value else {
            throw Failure(message: reply.error ?? "CORE01: shared rules failed")
        }
        return value
    }

    func value<Value: Decodable>(_ type: Value.Type, operation: String, input: Any, fallback: Value) -> Value {
        do { return try decode(type, operation: operation, input: input) }
        catch {
            // Do not log input URLs, HTML or tokens.
            NSLog("[tasu-core] Shared operation failed: %@", operation)
            return fallback
        }
    }
}
