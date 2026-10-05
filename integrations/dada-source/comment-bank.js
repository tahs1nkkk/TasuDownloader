export const CATEGORY_DEFS = [
  { id: "kisilik", label: "Kişilik" },
  { id: "avatar", label: "Avatar" },
  { id: "uzme", label: "Dadasını Üzmeme" }
];

export const TONE_OPENERS = {
  classic: [
    "personal dadası olarak bu küçük kızıma puanım {score}/10",
    "diğer küçük kızlarım alınmasın ama bu kızıma puanım {score}/10",
    "dadasının gözüne girmeye çalışan bu küçük kızıma puanım {score}/10",
    "kendini favorim sanan bu küçük kızıma puanım {score}/10",
    "dadasından ilgi bekleyen bu küçük kızıma puanım {score}/10"
  ],

  contract: [
    "iki robux görünce uslanan bu küçük kızıma puanım {score}/10",
    "dripi var sanıyo ama yarısı dada parası, puanı {score}/10",
    "robux gelince dadasını hatırlayan küçük kızıma puanım {score}/10",
    "avatarını dadasına borçlu küçük kızıma puanım {score}/10",
    "dadası sponsor olmasa sessiz kalcak küçük kızıma puanım {score}/10"
  ],

  strict: [
    "dadasının ilgisini hak etmeyen küçük kızıma puanım {score}/10",
    "dadasından yüz bulunca rahatlayan küçük kızıma puanım {score}/10",
    "kendini egirl sanan küçük kızıma puanım {score}/10",
    "miyavlamayı unutunca değeri düşen küçük kızıma puanım {score}/10",
    "dadasını bekletcek kadar önemsiz sanan küçük kızıma puanım {score}/10"
  ],

  freaky: [
    "miyavlamayı sadece dadasına saklayan küçük kızıma puanım {score}/10",
    "dadasının yanında hemen uslanan bu kediciğe puanım {score}/10",
    "kime miyavlaması gerektiğini bilen küçük kızıma puanım {score}/10",
    "dadası bakınca bakışları değişen bu kittye puanım {score}/10",
    "ilgi kesilince hemen miyavlayan küçük kızıma puanım {score}/10"
  ]
};

export const CATEGORY_LINES = {
  kisilik: {
    1: [
      "küçük kızım dadasını unutmuş, sonra masum takılıyo. bu numara bu sefer yemedi",
      "dada ilgisini garanti sanmış küçük kızım, o kadar rahat olmasın",
      "miyavı geç geliyo, ilgisi başka yerde. dadası bunu tatlı bulmadı",
      "uslu küçük kızım gibi duruyo ama arada özenti tarafı çıkıyo",
      "dadasının kıymetini anlamayan küçük kızım robux beklemesin"
    ],
    2: [
      "küçük kızım kötü değil ama dadasını unutma huyu fazla belli",
      "miyavlıyo ama hep geç kalıyo, dadası bunu görmüyo sanmasın",
      "arada tatlı arada özenti, favori olmak için daha çok çalışması lazım",
      "dada ilgisini seviyo ama karşılığını pek veremiyo küçük kızım",
      "kedicik havası var ama küçük kızım ilgiyi tam hak etmiş değil"
    ],
    3: [
      "küçük kızım fena değil ama dadasını daha hızlı hatırlayabilir",
      "miyavı var, çabası var, biraz daha uslu küçük kızım gibi davranmalı",
      "dadasının gözünde yeri var ama küçük kızım fazla rahatlamasın",
      "bazen uslu kedicik bazen de fazla rahat küçük kızım",
      "dadasını çok üzmüyo ama tamamen salıncak küçük kızlardan da değil"
    ],
    4: [
      "küçük kızım diğerlerinden sıyrılıyo, dadasını unutmazsa yeri sağlam",
      "uslu kedicik hali iyi, biraz şımarıyo ama dadası yine bakıyo",
      "miyavı iyi, küçük kızım değerini biliyo ve bunu kullanıyo",
      "favori olmaya fazla yaklaşan küçük kızım diğerleri alınmasın",
      "küçük kızım sıradan durmuyo, dada ilgisini de boşa harcamıyo"
    ],
    5: [
      "küçük kızım tam kedicik olmuş, dadasının ilgisi bunda boşa gitmiyo",
      "miyavı yerinde, tavrı tatlı, küçük kızım ilgiyi hak ediyo",
      "bu küçük kızım favori olma işini biraz fazla ciddiye aldı",
      "uslu küçük kızım gibi duruyo ve bu sefer rol yapmıyo",
      "küçük kızım diğerlerinden ayrıldı, dadasının eli rahatladı"
    ]
  },

  avatar: {
    1: [
      "dadasının robuxu olmasa bu avatar ayakta durmazdı küçük kızım",
      "drip denemiş ama özenti tarafı daha yüksek kalmış",
      "küçük kızım avatarı kurtardığını sanıyo ama robuxsuz yerler belli",
      "bu avatarla fazla hava yapılmaz, dada eli değmeden yarım kalmış",
      "küçük kızım kombin yapmış ama ortaya biraz noname işi çıkmış"
    ],
    2: [
      "avatar toparlanır ama küçük kızım dadasız fazla uzağa gidemez",
      "dripi var sanıyo ama dadası eksik yerleri hemen görüyo",
      "küçük kızım uğraşmış, avatar hâlâ robux istiyo gibi",
      "özenti biraz fazla kaçmış ama dada eli değerse düzelir",
      "avatar kötü değil ama küçük kızım bunu tek başına açıklayamaz"
    ],
    3: [
      "avatar idare eder, küçük kızım robux kısmını unutmasın",
      "küçük kızım avatarı taşıyo ama dadasız aynı hava olur muydu bilinmez",
      "avatar dengeli, özentiye düşmemiş ama hâlâ dada eli istiyo",
      "drip orta, küçük kızım büyütmek istiyosa miyavı düzgün olsun",
      "avatar fena değil, küçük kızım bunu kendi başarısı sanmasın"
    ],
    4: [
      "avatar iyi, dada robuxu doğru yere gitmiş küçük kızım",
      "drip güzel, küçük kızım fazla hava yapmazsa robux devam eder",
      "avatar dikkat çekiyo, küçük kızımın üstünde iyi durmuş",
      "dadasının gözü memnun, küçük kızım kalabalıktan ayrılıyo",
      "robux boşa gitmemiş, avatar küçük kızımı toparlamış"
    ],
    5: [
      "avatar baya iyi, küçük kızım drip hakkını vermiş",
      "drip temiz, küçük kızım taşıyo, dadası bu sefer pişman değil",
      "bu avatarla küçük kızım sıradan kalmaz",
      "küçük kızım avatarı iyi taşımış, robux ilk kez huzurlu",
      "avatar güçlü, küçük kızım şımarmazsa robux akışı sürer"
    ]
  },

  uzme: {
    1: [
      "küçük kızım miyavı kesmiş, sonra robux bekliyo. öyle dünya yok",
      "dadasını unutup oyun giren küçük kızım bu sefer yakalandı",
      "miyav yok ilgi yok ama robux beklentisi tam,ah küçük kızım",
      "küçük kızım dadasının ilgisini garanti sanmış, yanlış düşünmüş",
      "uslu kedicik rolü bozuldu, küçük kızım biraz kendine gelsin"
    ],
    2: [
      "miyavı var ama düzeni yok, küçük kızım dadasının sabrını deniyo",
      "dadasını unutuyo sonra kitty gibi dönüyo, tam yemedi",
      "küçük kızım üzüyo ama geri gelişi tatlı diye kapı kapanmadı",
      "miyav borcu birikmiş, küçük kızım ilgiyi fazla test ediyo",
      "robux konuşulur ama önce küçük kızım miyavını düzene soksun"
    ],
    3: [
      "dadası affetti ama unutmadı, küçük kızım bunu zafer sanmasın",
      "küçük kızım ortada, ne tam uslu ne de tamamen sorun",
      "miyavı var ilgisi var ama dadasını bazen fazla rahat bırakıyo",
      "robux hemen kesilmez ama küçük kızım daha düzenli olmalı",
      "dadası çok kırgın değil, küçük kızım yine de rahatlamasın"
    ],
    4: [
      "küçük kızım dadasını az üzüyo, miyavı da yerinde",
      "genelde uslu küçük kızım, arada şımarıyo ama yeri duruyo",
      "miyavları tatlı, küçük kızım bunu bozmazsa robuxumu hakeder",
      "dada ilgisini hak ediyo ama küçük kızım fazla gevşemesin",
      "kedicik hali iyi, küçük kızım dadasını çoğu zaman hatırlıyo"
    ],
    5: [
      "küçük kızım günde üç miyavı geçiyo, dadasını hiç yormuyo",
      "dadasını üzmeyen küçük kızım robuxu da ilgiyi de hak ediyo",
      "kedicik hali temiz, küçük kızımın yeri ayrı",
      "miyavı zamanında, tavrı tatlı, dadası buna kıyamıyo",
      "küçük kızım hem miyavlıyo hem değerini biliyo"
    ]
  }
};

export const TONE_LINES = {
  contract: {
    kisilik: {
      1: [
        "küçük kızım dada ilgisini garanti sanmış, robux tarafı bunu sevmedi",
        "miyav düşük, robux beklentisi yüksek; küçük kızım hesabı şaşırmış"
      ],
      3: [
        "dada ilgisi var ama küçük kızım robux için daha düzgün miyavlamalı",
        "küçük kızım orta karar, robux eli ne açılır ne kapanır"
      ],
      5: [
        "küçük kızım robuxu hak edicek kadar değerini biliyo",
        "dada ilgisi boşa gitmiyo, küçük kızım robux tarafını rahatlatıyo"
      ]
    },

    avatar: {
      1: [
        "avatarın robux tarafı zayıf, küçük kızım buna drip demesin",
        "dadasının robuxu olmasa küçük kızım bu avatarla çok gitmezdi"
      ],
      3: [
        "drip orta, küçük kızım bunu fazla büyütmesin",
        "avatar fena değil, dada eli biraz açılsa küçük kızım uçar"
      ],
      5: [
        "drip temiz, robux boşa gitmemiş, küçük kızım taşıyo",
        "avatar baya iyi, dada robuxu küçük kızımın üstünde durmuş"
      ]
    },

    uzme: {
      1: [
        "miyav yokken robux bekleyen küçük kızım fazla cesur",
        "dadasını unutup robux bekliyo, küçük kızım hesabı bozmuş"
      ],
      5: [
        "miyavları yerinde, robux eli rahat, küçük kızım uslu",
        "küçük kızım dadasını hatırlıyo, robux tarafı huzurlu"
      ]
    }
  },

  strict: {
    kisilik: {
      1: [
        "küçük kızım bu tavırla dada ilgisini zor görür",
        "dadasını unutması yazıldı, masum dönüşü kurtarmadı"
      ],
      3: [
        "küçük kızım fena değil ama hemen rahatlamasın",
        "orta gidiyo, bir miyav eksikliği daha robuxu soğutur"
      ],
      5: [
        "küçük kızım iyi duruyo ama şımarmasın, dadası her şeyi görüyo",
        "uslu küçük kızım çizgisi iyi, gereksiz hava yapmasın"
      ]
    },

    avatar: {
      1: [
        "avatar özentiye kaçmış, küçük kızımın özgüveni fazla",
        "drip iddiası var ama dadası pek ciddiye almadı"
      ],
      3: [
        "avatar idare eder, küçük kızım bunu zafer sanmasın",
        "drip var ama sınırı belli, küçük kızım fazla hava yapmasın"
      ],
      5: [
        "avatar iyi, küçük kızım bozarsa robux geri çekilir",
        "drip güçlü ama küçük kızım bunu şımarma izni sanmasın"
      ]
    },

    uzme: {
      1: [
        "küçük kızım miyavı bu kadar aksatıp dada ilgisi beklemesin",
        "robux desteği soğur, çünkü küçük kızım dadasını fazla zorladı"
      ],
      5: [
        "miyavları düzgün, küçük kızım dadasını üzmüyo",
        "küçük kızım uslu duruyo, sert yazcak bişey bırakmadı"
      ]
    }
  },

  freaky: {
    kisilik: {
      1: [
        "küçük kızım uslu görünmeye çalıştı ama dadası yemedi",
        "fazla masum oynayan küçük kızım bazı şeyleri belli etti"
      ],
      3: [
        "küçük kızım arada uslu arada fazla rahat, dadası gördü",
        "miyavı masum ama küçük kızım altını fazla dolduruyo"
      ],
      5: [
        "uslu küçük kızım hali iyi, bu sefer oyunu temiz oynadı",
        "dadası fazla açmaz ama küçük kızım bugün iyi durdu"
      ]
    },

    avatar: {
      1: [
        "avatar masum duruyo ama küçük kızımın havası ele veriyo",
        "küçük kızım avatarla kurtarmaya çalıştı, dadası yine gördü"
      ],
      3: [
        "avatar sakin ama küçük kızımın enerjisi fazla belli",
        "drip var, masumiyet ayrı konu, dadası uzatmıyo"
      ],
      5: [
        "avatar temiz, küçük kızım taşıyo, dadası fazlasını yazmaz",
        "drip iyi, küçük kızım uslu görünmeyi başarmış"
      ]
    },

    uzme: {
      1: [
        "küçük kızım uslu görünmeye çalıştı ama dadasını üzdüğü belli",
        "dadası açmaz ama küçük kızım bu puanı kendi hazırladı"
      ],
      5: [
        "miyavları uslu, küçük kızım dadasını yormuyo",
        "küçük kızım dadasını üzmüyo, daha fazlasını aramaya gerek yok"
      ]
    }
  }
};

export const PIN_LINES = [
  "📌 Küçük kızım başka dadalara bakmasın.",
  "📌 Küçük kızım dadasını unutmasın.",
  "📌 Robuxu miyavlama performansına bağlıdır.",
  "📌 Uslu küçük kızım ilgiyi sadece benden alır.",
  "📌 Dadanla özel anlarını unutma."
];

export const PLAIN_PINS = [
  "📌 Küçük kızım başka dadalara bakmasın.",
  "📌 Küçük kızım dadasını unutmasın.",
  "📌 Robuxu miyavlama performansına bağlıdır.",
  "📌 Uslu küçük kızım ilgiyi sadece benden alır.",
  "📌 Dadanla özel anlarını unutma."
];

export const BADGES = [
  "🔒 Tasması Boynunda",
  "🐾 Uslu Kedicik",
  "🐈 Beni Görünce Mırlıyor",
  "🥛 Sütümü Hak Etti",
  "✂️ Diğer Kızlarımla Makas Seviyor",
  "💵 Robuxumu Haketti",
  "👱🏻‍♀️ pawsocks giydiriyorum"
];

export const FREAKY_EMOJI = ["🐾", "🥛", "😈", "😉", "👣", "💄", "📌"];
export const PRESET_LINES = {
  dada: {},

  good: {
    kisilik: {
      1: [
        "good girl havas\u0131na girmeye \u00e7al\u0131\u015f\u0131yor ama dada hen\u00fcz proud de\u011fil",
        "uslu k\u0131z\u0131m rol\u00fc var ama miyav\u0131 ge\u00e7 gelince dada ikna olmad\u0131",
        "dada proud olmak istiyor ama tavr\u0131 daha prova gibi duruyor"
      ],
      3: [
        "uslu k\u0131z\u0131m enerjisi var, dada proud olmaya yak\u0131n ama \u015f\u0131marma pay\u0131 y\u00fcksek",
        "good girl \u00e7izgisine yakla\u015f\u0131yor, sadece dadas\u0131n\u0131 daha h\u0131zl\u0131 hat\u0131rlamal\u0131",
        "miyav\u0131 fena de\u011fil, dada proud dedi\u011fi an fazla havaya girmesin"
      ],
      5: [
        "good girl \u00e7izgisi net, uslu k\u0131z\u0131m bug\u00fcn dada proud yapt\u0131",
        "dadas\u0131n\u0131n yan\u0131nda uslu duruyor, bu enerji direkt dada proud",
        "miyav\u0131 zaman\u0131nda, tavr\u0131 temiz; uslu k\u0131z\u0131m yerini hak etti"
      ]
    },
    avatar: {
      1: [
        "good girl pozu vermi\u015f ama avatar taraf\u0131 dada proud seviyesine \u00e7\u0131kamad\u0131",
        "uslu k\u0131z\u0131m gibi duruyor ama drip daha \u00e7ok deneme s\u00fcr\u00fcm\u00fc",
        "avatar masum kalm\u0131\u015f, dada proud demek i\u00e7in biraz daha emek ister"
      ],
      3: [
        "avatar orta \u015feker, uslu k\u0131z\u0131m havas\u0131 var ama final dokunu\u015fu eksik",
        "drip idare ediyor, dada proud olmadan \u00f6nce bir t\u0131k daha toparlanmal\u0131",
        "good girl enerjisi avatara az da olsa ge\u00e7mi\u015f, dada bunu not etti"
      ],
      5: [
        "avatar temiz, good girl havas\u0131n\u0131 ta\u015f\u0131yor; dada proud bo\u015fa de\u011fil",
        "drip yerinde, uslu k\u0131z\u0131m bunu \u015fa\u015f\u0131rtmadan ta\u015f\u0131m\u0131\u015f",
        "avatar dada proud seviyesinde, robux pi\u015fman durmuyor"
      ]
    },
    uzme: {
      1: [
        "good girl bekledik ama miyav gecikti, dada proud defteri bug\u00fcn kapal\u0131",
        "uslu k\u0131z\u0131m rol\u00fc yar\u0131da kalm\u0131\u015f, dadas\u0131n\u0131 \u00fczmeme k\u0131sm\u0131 zay\u0131f",
        "miyav az, ilgi az; dada proud olmak i\u00e7in bu tempo yetmedi"
      ],
      3: [
        "dadas\u0131n\u0131 bazen hat\u0131rl\u0131yor, bazen unutuyor; good girl dosyas\u0131 beklemede",
        "uslu k\u0131z\u0131m say\u0131l\u0131r ama miyav takvimi daha d\u00fczg\u00fcn olmal\u0131",
        "dada proud demeye yak\u0131n, sadece ilgiyi garanti sanmas\u0131n"
      ],
      5: [
        "miyav\u0131 d\u00fczenli, tavr\u0131 uslu; dada proud seviyesi bu",
        "good girl enerjisi sabit, dadas\u0131n\u0131 \u00fczmeden robux yolunu a\u00e7\u0131yor",
        "uslu k\u0131z\u0131m bug\u00fcn dadas\u0131n\u0131 yormad\u0131, puan\u0131n\u0131 hak etti"
      ]
    }
  },

  robux: {
    kisilik: {
      1: [
        "robux kedici\u011fi olmak istiyor ama miyav performans\u0131 bu b\u00fct\u00e7eyi a\u00e7mad\u0131",
        "robux g\u00f6r\u00fcnce uslan\u0131yor, yokken dadas\u0131n\u0131 unutuyor; bu hesap tutmad\u0131",
        "dada sponsorlu\u011fu bekliyor ama tavr\u0131 drip kadar parlak de\u011fil"
      ],
      3: [
        "robux kedici\u011fi potansiyeli var, dada eli a\u00e7\u0131l\u0131rsa daha iyi miyavlar",
        "miyav orta, robux iste\u011fi net; dada bunu pazarl\u0131k konusu yapt\u0131",
        "drip i\u00e7in dadas\u0131na bak\u0131yor, en az\u0131ndan bunu saklam\u0131yor"
      ],
      5: [
        "robux kedici\u011fi gibi parlad\u0131, dada sponsorlu\u011fu bug\u00fcn bo\u015fa gitmedi",
        "robux kokusunu al\u0131nca miyav\u0131 da tavr\u0131 da d\u00fczg\u00fcnle\u015fiyor",
        "dada robuxu ile parlayan uslu k\u0131z\u0131m, bu puan\u0131 hak etti"
      ]
    },
    avatar: {
      1: [
        "dadas\u0131n\u0131n robuxu olmadan bu drip fazla sessiz kal\u0131rd\u0131",
        "avatar robux kedici\u011fi iddias\u0131 ta\u015f\u0131yor ama b\u00fct\u00e7e etkisi zay\u0131f",
        "drip denemi\u015f, fakat dada sponsor etiketi olmadan yar\u0131m duruyor"
      ],
      3: [
        "avatar robux istiyor ama tamamen umutsuz de\u011fil, dada bakarsa toparlar",
        "drip orta, robux kedici\u011fi enerjisi var ama final dokunu\u015fu eksik",
        "dada robuxu az de\u011fmi\u015f gibi, avatar bir t\u0131k daha destek bekliyor"
      ],
      5: [
        "avatar dada robuxu ile parlam\u0131\u015f, drip taraf\u0131 bunu saklam\u0131yor",
        "robux kedici\u011fi kombini temiz ta\u015f\u0131m\u0131\u015f, dada sponsorlu\u011fu belli",
        "drip yerinde, robux bo\u015fa gitmemi\u015f; bu avatar konu\u015fur"
      ]
    },
    uzme: {
      1: [
        "miyav yokken robux bekliyor, dada bu ekonomiyi kabul etmedi",
        "robux kedici\u011fi olmak istiyor ama dadas\u0131n\u0131 hat\u0131rlama oran\u0131 d\u00fc\u015f\u00fck",
        "drip talebi y\u00fcksek, ilgi kar\u015f\u0131l\u0131\u011f\u0131 d\u00fc\u015f\u00fck; dada eli kapand\u0131"
      ],
      3: [
        "miyav geliyor ama aral\u0131kl\u0131, robux konusu \u015fimdilik beklemede",
        "dadas\u0131n\u0131 arada mutlu ediyor, arada sponsorlu\u011fu riske at\u0131yor",
        "robux kedici\u011fi dengede, dada hen\u00fcz muslu\u011fu tam a\u00e7mad\u0131"
      ],
      5: [
        "miyav d\u00fczenli, dada memnun; robux yolu bug\u00fcn a\u00e7\u0131k",
        "robux kedici\u011fi uslu durdu, dadas\u0131n\u0131 \u00fczmeden sponsorlu\u011fu hak etti",
        "dada ilgisi bo\u015fa gitmedi, miyav performans\u0131 robuxu ta\u015f\u0131d\u0131"
      ]
    }
  },

  freaky: {
    kisilik: {
      1: [
        "miyav\u0131 masum g\u00f6steriyor ama alt metni dada hemen yakalad\u0131",
        "good girl gibi durmaya \u00e7al\u0131\u015ft\u0131, dada o bak\u0131\u015f\u0131 fazla iyi tan\u0131yor",
        "uslu kedicik rol\u00fc var ama c\u00fcmle aralar\u0131 fazla konu\u015fuyor"
      ],
      3: [
        "uslu duru\u015fu inand\u0131r\u0131c\u0131, alt metni de dada taraf\u0131ndan not edildi",
        "miyav\u0131 sakin ama enerjisi biraz fazla belli, dada uzatmadan ge\u00e7iyor",
        "good girl enerjisi var, fazlas\u0131n\u0131 dada burada yazmaz"
      ],
      5: [
        "miyav\u0131 yerinde, bak\u0131\u015f\u0131 kontroll\u00fc; dada alt metni okuyup sustu",
        "uslu kedicik gibi duruyor ama dada o enerjiyi gayet iyi anlad\u0131",
        "good girl modu temiz, freaky taraf\u0131n\u0131 da dozunda sakl\u0131yor"
      ]
    },
    avatar: {
      1: [
        "avatar masum anlat\u0131yor ama enerji ba\u015fka bir \u015fey s\u00f6yl\u00fcyor",
        "drip zay\u0131f kalm\u0131\u015f, dada alt metni g\u00f6rd\u00fc ama puan vermedi",
        "kedicik havas\u0131 var, fakat avatar bu imay\u0131 ta\u015f\u0131yamad\u0131"
      ],
      3: [
        "avatar sakin, ima hafif; dada bunu orta ayarda tuttu",
        "drip var ama fazlas\u0131n\u0131 yazd\u0131racak kadar cesur de\u011fil",
        "kedicik enerjisi ge\u00e7iyor, avatar sadece biraz daha net olmal\u0131"
      ],
      5: [
        "avatar temiz, ima dozunda; dada fazlas\u0131n\u0131 Roblox'a b\u0131rakmad\u0131",
        "drip iyi, kedicik enerjisi kontroll\u00fc; bu kombin mesaj\u0131 veriyor",
        "avatar bak\u0131\u015f\u0131 de\u011fi\u015ftiriyor, dada bunu fazla a\u00e7madan be\u011fendi"
      ]
    },
    uzme: {
      1: [
        "miyav kesilince alt metin de bo\u015fta kald\u0131, dada bundan etkilenmedi",
        "uslu kedicik rol\u00fc var ama dadas\u0131n\u0131 \u00fczmeme k\u0131sm\u0131 \u00e7al\u0131\u015fmad\u0131",
        "good girl havas\u0131 yetmedi, dada ilgi matemati\u011fini kabul etmedi"
      ],
      3: [
        "dadas\u0131n\u0131 bazen \u00fczm\u00fcyor, bazen fazla rahat b\u0131rak\u0131yor; ima dengede",
        "miyav\u0131 var ama s\u00fcreklilik yok, dada bunu \u015fimdilik izliyor",
        "uslu kedicik modu a\u00e7\u0131k ama arada sinyal kaybediyor"
      ],
      5: [
        "miyav\u0131 d\u00fczenli, ilgisi net; dada burada fazlas\u0131n\u0131 s\u00f6ylemez",
        "good girl enerjisi sabit, dadas\u0131n\u0131 \u00fczmeden freaky imay\u0131 dozunda tutuyor",
        "uslu kedicik bug\u00fcn dada ilgisini bo\u015fa harcatmad\u0131"
      ]
    }
  },

  mean: {
    kisilik: {
      1: [
        "dada bu masum numaray\u0131 yutmad\u0131, miyav da tav\u0131r da zay\u0131f kald\u0131",
        "\u00f6zenti enerjisi fazla, uslu k\u0131z\u0131m dosyas\u0131 bug\u00fcn a\u00e7\u0131lmad\u0131",
        "kendini favori sanmas\u0131 erken olmu\u015f, dada o seviyeyi g\u00f6rmedi"
      ],
      3: [
        "tam batmad\u0131 ama parlamad\u0131 da, dada bunu orta ayarda tuttu",
        "\u00f6zenti taraf\u0131 azal\u0131rsa uslu k\u0131z\u0131m muhabbeti ba\u015flayabilir",
        "miyav var ama dada proud dedirtecek kadar temiz de\u011fil"
      ],
      5: [
        "dada ele\u015ftirmek istedi ama malzeme az, uslu k\u0131z\u0131m bug\u00fcn iyi durdu",
        "\u00f6zentiye d\u00fc\u015fmeden parlad\u0131, dada bunu istemeden de olsa verdi",
        "good girl enerjisi net, dada sert yazacak yer bulamad\u0131"
      ]
    },
    avatar: {
      1: [
        "drip iddias\u0131 var ama dada bunu fazla ciddiye almad\u0131",
        "avatar konu\u015fmaya \u00e7al\u0131\u015f\u0131yor ama s\u00f6z\u00fc yar\u0131da kalm\u0131\u015f",
        "\u00f6zenti pay\u0131 y\u00fcksek, dada robuxu burada sessiz kald\u0131"
      ],
      3: [
        "avatar idare eder, sadece kendini fazla b\u00fcy\u00fctmesin",
        "drip orta, dada bak\u0131nca eksikleri tek tek g\u00f6r\u00fcyor",
        "kombin kurtar\u0131yor ama hava yapacak kadar de\u011fil"
      ],
      5: [
        "avatar iyi, dada bile laf\u0131 yumu\u015fatmak zorunda kald\u0131",
        "drip temiz, \u00f6zentiye d\u00fc\u015fmeden ta\u015f\u0131m\u0131\u015f",
        "dada robuxu bo\u015fa gitmemi\u015f, bu avatar kendini belli ediyor"
      ]
    },
    uzme: {
      1: [
        "miyav yok, ilgi yok; sonra dada yumu\u015fas\u0131n bekliyor, olmad\u0131",
        "dadas\u0131n\u0131 \u00fczmeme konusunda s\u0131n\u0131fta kald\u0131, robux eli de so\u011fudu",
        "uslu kedicik denemesi k\u0131sa s\u00fcrd\u00fc, dada bu performans\u0131 yemedi"
      ],
      3: [
        "bazen iyi, bazen kayboluyor; dada bunu unutmad\u0131 ama kap\u0131y\u0131 da kapatmad\u0131",
        "miyav dengesi orta, dada sertle\u015fmeden \u00f6nce bir \u015fans daha verdi",
        "dadas\u0131n\u0131 tamamen \u00fczm\u00fcyor ama fazla rahatlad\u0131\u011f\u0131 yerler var"
      ],
      5: [
        "miyav\u0131 yerinde, dada bu sefer ele\u015ftirecek fazla \u015fey bulamad\u0131",
        "uslu kedicik modunu bozmad\u0131, robux eli kapanmad\u0131",
        "dadas\u0131n\u0131 \u00fczmedi, hatta dada proud dedirtecek kadar temiz oynad\u0131"
      ]
    }
  }
};

export const COMBO_LINES = {
  "contract:robux": {
    kisilik: {
      1: [
        "robux kokusunu al\u0131nca ortaya \u00e7\u0131k\u0131yor ama miyav\u0131 bu b\u00fct\u00e7eyi hak etmedi",
        "dada sponsorlu\u011funu istiyor, kar\u015f\u0131l\u0131k olarak sadece eksik miyav b\u0131rak\u0131yor",
        "robux kedici\u011fi rol\u00fc zay\u0131f, dada bu yat\u0131r\u0131m\u0131 dondurdu"
      ],
      3: [
        "robux taraf\u0131 umutlu ama dada hen\u00fcz tam sponsor moduna ge\u00e7medi",
        "miyav orta, robux iste\u011fi belirgin; dada bunu taksitli de\u011ferlendiriyor",
        "drip i\u00e7in dadas\u0131na bak\u0131yor, en az\u0131ndan robux ger\u00e7e\u011fini biliyor"
      ],
      5: [
        "robux kedici\u011fi bug\u00fcn sponsorlu\u011fu hak etti, dada kasas\u0131 bo\u015fa a\u00e7\u0131lmad\u0131",
        "miyav\u0131 robux de\u011ferinde geldi, dada bu performansa cimri kalmad\u0131",
        "dada robuxu ile parlad\u0131 ama tavr\u0131 da bunu ta\u015f\u0131yacak kadar uslu"
      ]
    },
    avatar: {
      1: [
        "avatar robux istiyor ama dada bu kombine sponsor yazmaz",
        "drip diye sunmu\u015f ama robux izi az, dada paras\u0131 burada durdu",
        "bu avatar dada c\u00fczdan\u0131na bak\u0131yor ama kar\u015f\u0131l\u0131\u011f\u0131n\u0131 veremiyor"
      ],
      3: [
        "avatar biraz robux g\u00f6rm\u00fc\u015f, biraz da daha fazlas\u0131n\u0131 istiyor",
        "drip orta seviye sponsorlu, dada eli a\u00e7\u0131lsa toparlar",
        "robux kedici\u011fi kombini say\u0131l\u0131r ama premium miyav eksik"
      ],
      5: [
        "avatar net sponsorlu duruyor, robux burada kendini belli etti",
        "drip temiz, dada robuxu bu sefer ger\u00e7ekten yerini bulmu\u015f",
        "robux kedici\u011fi kombini parlatm\u0131\u015f, dada bunu bo\u015fa yat\u0131r\u0131m saymad\u0131"
      ]
    },
    uzme: {
      1: [
        "miyav yokken robux istemesi fazla cesur, dada kasay\u0131 kapatt\u0131",
        "dadas\u0131n\u0131 \u00fcz\u00fcp sponsor bekliyor, bu ekonomi Roblox'ta bile d\u00f6nmez",
        "robux performans\u0131 istiyor ama ilgi borcu kabarm\u0131\u015f durumda"
      ],
      3: [
        "dadas\u0131n\u0131 bazen memnun ediyor, robux konusu bu y\u00fczden beklemede",
        "miyav\u0131 aral\u0131kl\u0131 geliyor, sponsorlu\u011fu da aral\u0131kl\u0131 hak ediyor",
        "robux yolu kapanmad\u0131 ama dada bunun faturas\u0131n\u0131 izliyor"
      ],
      5: [
        "miyav d\u00fczenli, dada memnun, robux deste\u011fi bug\u00fcn hak edilmi\u015f",
        "dadas\u0131n\u0131 \u00fczmeden sponsorlu\u011fu ta\u015f\u0131d\u0131, robux kedici\u011fi seviyesinde",
        "ilgi dengesi temiz, dada kasas\u0131 bu performansa k\u0131yamaz"
      ]
    }
  },

  "freaky:freaky": {
    kisilik: {
      1: [
        "masum miyav denedi ama alt metin fazla s\u0131r\u0131tt\u0131, dada bunu yemedi",
        "uslu duru\u015fu var ama sinyal kar\u0131\u015f\u0131k, dada freaky taraf\u0131 zay\u0131f buldu",
        "bak\u0131\u015f var, miyav yok; dada bu imay\u0131 puana \u00e7evirmedi"
      ],
      3: [
        "miyav\u0131 sakin, alt metni belli; dada bunu orta dozda b\u0131rakt\u0131",
        "uslu gibi duruyor ama c\u00fcmle aralar\u0131 konu\u015fuyor, dada notunu ald\u0131",
        "freaky sinyal geliyor ama dada bunu Roblox'a uygun seviyede tuttu"
      ],
      5: [
        "miyav\u0131 dozunda, imas\u0131 temiz; dada fazlas\u0131n\u0131 yazmadan anlad\u0131",
        "uslu kedicik haliyle freaky alt metni iyi saklad\u0131, dada bunu be\u011fendi",
        "bak\u0131\u015f\u0131 de\u011fi\u015ftiren enerji var, dada burada noktay\u0131 koydu"
      ]
    },
    avatar: {
      1: [
        "avatar ima vermeye \u00e7al\u0131\u015f\u0131yor ama drip bunu ta\u015f\u0131yamad\u0131",
        "kedicik havas\u0131 denemi\u015f, dada sinyali ald\u0131 ama puanlamad\u0131",
        "freaky enerji var gibi yap\u0131yor, avatar taraf\u0131 bunu desteklemiyor"
      ],
      3: [
        "avatar sakin ama alt metin var, dada bunu orta seviyede tuttu",
        "drip biraz konu\u015fuyor, fazlas\u0131n\u0131 dada burada a\u00e7mad\u0131",
        "kedicik enerjisi ge\u00e7iyor ama net imza i\u00e7in biraz eksik"
      ],
      5: [
        "avatar imay\u0131 dozunda veriyor, dada bunu fazla konu\u015fmadan onaylad\u0131",
        "drip temiz, freaky alt metni kontroll\u00fc; bu kombin mesaj\u0131n\u0131 verdi",
        "kedicik enerjisi avatarla uyumlu, dada fazlas\u0131n\u0131 yazmad\u0131"
      ]
    },
    uzme: {
      1: [
        "miyav kesilince alt metin de bo\u015fa d\u00fc\u015ft\u00fc, dada etkilenmedi",
        "uslu rol\u00fc oynad\u0131 ama dadas\u0131n\u0131 \u00fczmeme k\u0131sm\u0131 eksik kald\u0131",
        "freaky sinyal var ama ilgi yok, dada bu matemati\u011fi kabul etmedi"
      ],
      3: [
        "dadas\u0131n\u0131 bazen mutlu ediyor, bazen sinyali kesiyor; denge ortada",
        "miyav\u0131 geliyor ama s\u00fcrekli de\u011fil, dada bunu izlemeye ald\u0131",
        "uslu kedicik modu a\u00e7\u0131k ama arada ba\u011flant\u0131 d\u00fc\u015f\u00fcyor"
      ],
      5: [
        "miyav\u0131 d\u00fczenli, imas\u0131 dozunda; dada bu performansa sustu",
        "dadas\u0131n\u0131 \u00fczmeden freaky enerjiyi ta\u015f\u0131d\u0131, fazla s\u00f6ze gerek yok",
        "uslu kedicik sinyali sabit tuttu, dada ilgisi bo\u015fa gitmedi"
      ]
    }
  },

  "strict:mean": {
    kisilik: {
      1: [
        "dada bu tavra puan de\u011fil uyar\u0131 verdi, masum rol\u00fc kurtarmad\u0131",
        "miyav gecikmi\u015f, tav\u0131r fazla rahat; dada bunu sert yazd\u0131",
        "kendini favori sanmas\u0131 erken, dada bu seviyeyi kabul etmedi"
      ],
      3: [
        "tam batmad\u0131 ama dada proud da de\u011fil, orta yerde bekliyor",
        "tavr\u0131 fena de\u011fil ama dada bunu \u015f\u0131marma izni saymad\u0131",
        "miyav var, eksik de var; sert dada burada denge verdi"
      ],
      5: [
        "dada sert yazmak istedi ama malzeme az, bu performans temiz kald\u0131",
        "uslu durdu, dada ele\u015ftirecek yer arad\u0131 ama bulamad\u0131",
        "favori havas\u0131n\u0131 bu sefer bo\u015f yapmad\u0131, dada puan\u0131 verdi"
      ]
    }
  },

  "classic:good": {
    kisilik: {
      1: [
        "good girl olmak istiyor ama dada proud seviyesi hen\u00fcz uzak",
        "uslu rol\u00fc var, miyav disiplini yok; dada bunu tatl\u0131 bulmad\u0131",
        "dada proud bekliyorsa \u00f6nce ilgiyi zaman\u0131nda vermeli"
      ],
      3: [
        "good girl taraf\u0131 belli, biraz daha uslu kal\u0131rsa dada proud gelir",
        "miyav\u0131 var, tavr\u0131 idare eder; dada bunu geli\u015fime a\u00e7\u0131k buldu",
        "uslu enerjisi geliyor ama favori raf\u0131 i\u00e7in erken"
      ],
      5: [
        "good girl enerjisi net, dada proud c\u00fcmlesi bug\u00fcn hak edildi",
        "uslu durdu, miyav\u0131n\u0131 verdi, dada bu tabloya itiraz etmedi",
        "dada proud seviyesi temiz, ilgiyi bo\u015fa harcatmad\u0131"
      ]
    }
  }
};
