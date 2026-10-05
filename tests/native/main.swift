import Foundation

// The same fixtures run under Node and Apple's real JavaScriptCore + Swift DTO.
func jsonData(_ value: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys])
}

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let script = try String(contentsOf: root.appendingPathComponent("ios-app/Resources/generated/rg-shared-rules.js"), encoding: .utf8)
let core = SharedCore(script: script)
let bytes = try Data(contentsOf: root.appendingPathComponent("tests/fixtures/shared-core.json"))
let fixtures = try JSONSerialization.jsonObject(with: bytes) as! [[String: Any]]
var checked = 0
for fixture in fixtures {
    let name = fixture["name"] as! String
    let operation = fixture["operation"] as! String
    let input = fixture["input"]!
    if let expectedError = fixture["error"] as? String {
        do {
            _ = try DownloadRequest.parse(input as! [String: Any], core: core)
            fatalError("Expected rejection: \(name)")
        } catch {
            precondition(error.localizedDescription.hasPrefix(expectedError), "Wrong error: \(name)")
        }
    } else if operation == "download" {
        let request = try DownloadRequest.parse(input as! [String: Any], core: core)
        precondition(request.contractVersion == 1)
        precondition(request.type == "DIRECT_DOWNLOAD")
        let subset = fixture["expectedSubset"] as! [String: Any]
        // Convert the typed DTO back to a dictionary for an independent value check.
        let actual = Dictionary(uniqueKeysWithValues: Mirror(reflecting: request).children.compactMap { child -> (String, Any)? in
            guard let key = child.label else { return nil }
            if key == "namingUrl" {
                if let name = request.namingUrl { return (key, name) }
                return (key, NSNull())
            }
            return (key, child.value)
        })
        for (key, value) in subset where key != "futureField" {
            let matches = try jsonData(actual[key] ?? NSNull()) == jsonData(value)
            precondition(matches, "Mismatch \(name): \(key)")
        }
    } else if operation == "scrolller" {
        let value = try core.decode([String].self, operation: operation, input: input)
        let matches = try jsonData(value) == jsonData(fixture["expected"]!)
        precondition(matches, name)
    } else {
        let value = try core.decode(String.self, operation: operation, input: input)
        precondition(value == fixture["expected"] as! String, name)
    }
    checked += 1
}
print("Swift/JavaScriptCore parity: \(checked) fixtures passed.")
