"""Only typed download preferences cross the extension/worker boundary."""
def preferences(args):
    def enum(key, default, choices):
        value=args.get(key, default)
        if value not in choices:
            raise ValueError("Geçersiz indirme ayarı: " + key)
        return value
    def flag(key, default):
        value=args.get(key, default)
        if not isinstance(value, bool):
            raise ValueError("Geçersiz seçenek")
        return value
    naming=args.get("naming", {})
    if not isinstance(naming, dict):
        raise ValueError("Geçersiz dosya adı seçeneği")
    artist=naming.get("artist", True)
    order=naming.get("order", "artist_first")
    separator=naming.get("separator", " - ")
    if not isinstance(artist, bool) or order not in ("artist_first","title_first") or separator not in (" - "," – "," — "," _ "," "," • "):
        raise ValueError("Geçersiz dosya adı biçimi")
    return {"cookies":enum("cookies_from_browser",None,(None,"","edge","chrome","firefox","brave","opera")) or None,
            "naming":{"artist":artist,"order":order,"separator":separator},
            "video_quality":enum("video_quality","1080",("best","2160","1440","1080","720","480","360")),
            "options":{"embed_cover":flag("embed_cover",True),"ascii_tr":flag("ascii_tr",False),"cover_res":enum("cover_res","maks",("maks","yuksek","orta","dusuk"))}}
