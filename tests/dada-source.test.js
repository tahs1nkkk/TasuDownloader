"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),{pathToFileURL}=require("node:url"),fs=require("node:fs");
test("restored Dada preserves source categories, UTF-8 limit, flags and adult-only normalization",async()=>{
  const folder=path.resolve(__dirname,"../edge-extension/hub/dada");
  const {generateReview,utf8ByteLength}=await import(pathToFileURL(path.join(folder,"generator.js")));
  const {CATEGORY_DEFS}=await import(pathToFileURL(path.join(folder,"comment-bank.js")));
  assert.deepEqual(CATEGORY_DEFS.map(x=>x.id),["kisilik","avatar","uzme"]);
  for(const tone of ["classic","contract","strict","freaky"])for(const gender of ["female","male","littleFemale","littleMale"]){
    const r=generateReview({tone,gender,style:"dada",ratings:{avatar:5,kisilik:3,uzme:1},noEmoji:true,includeNote:true,includeBadge:true});
    assert.ok(r.text.length>60);assert.ok(utf8ByteLength(r.text)<=500);assert.ok(r.signature);
    assert.doesNotMatch(r.text,/little (?:girl|boy)|k[uü][cç][uü]k (?:k[iı]z|o[gğ]l)|çocuk|cocuk/i);
  }
  const ascii=generateReview({tone:"classic",gender:"female",style:"good",ratings:{},ascii:true});
  assert.doesNotMatch(ascii.text,/[şğüçöıŞĞÜÇÖİ]/);
  const popup=fs.readFileSync(path.join(folder,"popup.js"),"utf8");
  assert.ok(popup.includes('const GENDER_ORDER = ["female", "male"];'));assert.ok(popup.includes('"tasuApps:dada"'));
  assert.ok(popup.includes('10: "96341915563326"'));assert.ok(popup.includes('const MAX_BYTES = 500'));
});
