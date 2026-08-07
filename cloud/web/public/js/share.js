// Paylaşım penceresi: seçili dosyalar için tek açmalık public link üretir.
//
// Varsayılan bilinçli olarak dar: 1 açılış, 24 saat. Link tahmin edilemez bir
// token taşır ve süre/adet dolunca sunucu tarafında ölür — yani yanlış kişiye
// gitse bile pencere kendi kendine kapanır.

import { ICON, api, clear, dialog, el, toast } from "./core.js";

function field(label, input, hint) {
  return el("label", { class: "f" }, el("span", {}, label), input,
    hint ? el("small", { style: "display:block;margin-top:5px;color:var(--text-faint);font-size:11.5px" }, hint) : null);
}

async function showLink(url) {
  await dialog({
    title: "Link hazır",
    build: (box) => {
      const input = el("input", { type: "text", value: url, readonly: true });
      input.addEventListener("focus", () => input.select());
      const copy = el("button", {
        class: "vbtn primary", type: "button",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast("Kopyalandı", "ok");
          } catch {
            input.select();
            toast("Kopyalanamadı, elle seç", "err");
          }
        }
      }, "Kopyala");
      box.append(el("div", { class: "link-out" }, input, copy));
      box.append(el("a", {
        class: "vbtn", href: url, target: "_blank", rel: "noreferrer noopener",
        style: "margin-top:10px;justify-content:center;width:100%"
      }, "Yeni sekmede aç"));
    },
    buttons: [{ label: "Kapat", value: null }]
  });
}

export async function openShare(keys) {
  if (!keys || !keys.length) { toast("Paylaşılacak dosya yok", "err"); return; }

  const label = el("input", { type: "text", placeholder: "ör. Ali'ye gönderilecekler", maxlength: 80 });
  const opens = el("input", { type: "number", value: "1", min: "0", max: "1000", step: "1" });
  const hours = el("input", { type: "number", value: "24", min: "0", max: "8760", step: "1" });

  const url = await dialog({
    title: `${keys.length} dosya paylaş`,
    text: "Hangi sınır önce dolarsa link o an kapanır.",
    build: (box) => {
      box.append(field("Etiket (isteğe bağlı)", label));
      box.append(field("Kaç kez açılabilir", opens, "0 yazarsan sınırsız."));
      box.append(field("Kaç saat geçerli", hours, "0 yazarsan süresiz."));
    },
    buttons: [
      { label: "Vazgeç", value: null },
      {
        label: "Link oluştur", kind: "primary",
        run: async () => {
          try {
            const result = await api.post("/api/share", {
              keys,
              label: label.value.trim(),
              maxOpens: Math.max(0, Number(opens.value) || 0),
              ttlHours: Math.max(0, Number(hours.value) || 0)
            });
            return result.url;
          } catch (error) {
            toast(`Link oluşturulamadı: ${error.message}`, "err");
            return undefined; // kutu açık kalsın, kullanıcı düzeltebilsin
          }
        }
      }
    ]
  });

  if (url) await showLink(url);
}

/* ------------------------------------------------------------- yönetim */

export async function manageShares() {
  let rows = [];
  try {
    rows = await api.get("/api/share") || [];
  } catch (error) {
    toast(`Paylaşımlar alınamadı: ${error.message}`, "err");
    return;
  }

  await dialog({
    title: "Etkin paylaşımlar",
    text: rows.length ? null : "Şu an açık bir paylaşım linki yok.",
    build: (box) => {
      const tree = el("div", { class: "tree" });
      const draw = () => {
        clear(tree);
        for (const row of rows) {
          const remaining = row.maxOpens ? `${Math.max(0, row.maxOpens - row.opens)} açılış kaldı` : "sınırsız";
          const until = row.expiresAt ? new Date(row.expiresAt).toLocaleString("tr-TR") : "süresiz";
          const item = el("button", { type: "button", onclick: () => {
            navigator.clipboard.writeText(`${location.origin}/s/${row.token}`).then(
              () => toast("Kopyalandı", "ok"), () => toast("Kopyalanamadı", "err"));
          } },
            el("span", { class: "grow" },
              el("b", { style: "display:block;font-size:13px" }, row.label || `${row.count} dosya`),
              el("span", { style: "font-size:11.5px;color:var(--text-faint)" }, `${remaining} · ${until}`)),
            el("span", {
              class: "drive-kill", html: ICON.trash,
              onclick: async (event) => {
                event.stopPropagation();
                try {
                  await api.del(`/api/share/${encodeURIComponent(row.token)}`);
                  rows = rows.filter((r) => r.token !== row.token);
                  draw();
                  toast("İptal edildi", "ok");
                } catch (error) { toast(`İptal edilemedi: ${error.message}`, "err"); }
              }
            })
          );
          tree.append(item);
        }
      };
      draw();
      box.append(tree);
    },
    buttons: [{ label: "Kapat", value: null }]
  });
}
