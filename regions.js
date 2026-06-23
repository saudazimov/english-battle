// ===== VILOYAT-TUMAN RO'YXATI (backend validatsiya uchun) =====
// MUHIM: bu ro'yxat register.html dagi REGIONS bilan AYNAN bir xil bo'lishi kerak.
// Agar register.html da o'zgartirsangiz, bu yerda ham o'zgartiring (single source of truth).

const REGIONS = {
  "Toshkent shahri": ["Bektemir", "Chilonzor", "Mirobod", "Mirzo Ulug'bek", "Sergeli", "Shayxontohur", "Olmazor", "Uchtepa", "Yakkasaroy", "Yashnobod", "Yunusobod"],
  "Toshkent viloyati": ["Angren", "Bekobod", "Chirchiq", "Ohangaron", "Olmaliq", "Yangiyo'l", "Bo'ka", "Qibray", "Zangiota"],
  "Andijon": ["Andijon shahri", "Asaka", "Baliqchi", "Bo'ston", "Buloqboshi", "Izboskan", "Jalaquduq", "Marhamat", "Oltinko'l", "Paxtaobod", "Shahrixon", "Xo'jaobod"],
  "Buxoro": ["Buxoro shahri", "G'ijduvon", "Kogon", "Olot", "Peshku", "Qorako'l", "Romitan", "Shofirkon", "Vobkent"],
  "Farg'ona": ["Farg'ona shahri", "Beshariq", "Bog'dod", "Buvayda", "Dang'ara", "Furqat", "Quva", "Marg'ilon", "Qo'qon", "Rishton", "So'x", "Toshloq", "Uchko'prik", "O'zbekiston", "Yozyovon"],
  "Jizzax": ["Jizzax shahri", "Arnasoy", "Baxmal", "Do'stlik", "Forish", "G'allaorol", "Mirzacho'l", "Paxtakor", "Yangiobod", "Zafarobod", "Zarbdor", "Zomin"],
  "Xorazm": ["Urganch", "Bog'ot", "Gurlan", "Hazorasp", "Xonqa", "Xiva", "Qo'shko'pir", "Shovot", "Yangiariq", "Yangibozor"],
  "Namangan": ["Namangan shahri", "Chortoq", "Chust", "Kosonsoy", "Mingbuloq", "Norin", "Pop", "To'raqo'rg'on", "Uchqo'rg'on", "Uychi", "Yangiqo'rg'on"],
  "Navoiy": ["Navoiy shahri", "Karmana", "Konimex", "Navbahor", "Nurota", "Qiziltepa", "Tomdi", "Uchquduq", "Xatirchi", "Zarafshon"],
  "Qashqadaryo": ["Qarshi", "Chiroqchi", "Dehqonobod", "G'uzor", "Kasbi", "Kitob", "Koson", "Mirishkor", "Muborak", "Nishon", "Qamashi", "Shahrisabz", "Yakkabog'"],
  "Qoraqalpog'iston": ["Nukus", "Amudaryo", "Beruniy", "Chimboy", "Ellikqal'a", "Kegeyli", "Mo'ynoq", "Nukus tumani", "Qanliko'l", "Qo'ng'irot", "Qorao'zak", "Shumanay", "Taxtako'pir", "To'rtko'l", "Xo'jayli"],
  "Samarqand": ["Samarqand shahri", "Bulung'ur", "Ishtixon", "Jomboy", "Kattaqo'rg'on", "Narpay", "Nurobod", "Oqdaryo", "Past darg'om", "Paxtachi", "Payariq", "Qo'shrabot", "Toyloq", "Urgut"],
  "Sirdaryo": ["Guliston", "Boyovut", "Mirzaobod", "Oqoltin", "Sardoba", "Sayxunobod", "Sirdaryo tumani", "Xovos", "Yangiyer"],
  "Surxondaryo": ["Termiz", "Angor", "Bandixon", "Boysun", "Denov", "Jarqo'rg'on", "Muzrabot", "Oltinsoy", "Qiziriq", "Qumqo'rg'on", "Sariosiyo", "Sherobod", "Sho'rchi", "Termiz tumani", "Uzun"],
};

// Viloyat-tuman juftligini tekshiradi (ikkalasi ham MAJBURIY).
// Qaytaradi: { valid: true } yoki { valid: false, error: "..." }
function validateRegionDistrict(region, district) {
  // Viloyat majburiy
  if (!region || region.trim() === "") {
    return { valid: false, error: "Viloyatni tanlang" };
  }
  // Tuman majburiy
  if (!district || district.trim() === "") {
    return { valid: false, error: "Tumanni tanlang" };
  }

  // Viloyat ro'yxatda bormi?
  if (!REGIONS[region]) {
    return { valid: false, error: "Noto'g'ri viloyat" };
  }

  // Tuman shu viloyatga tegishlimi?
  if (REGIONS[region].indexOf(district) === -1) {
    return { valid: false, error: "Tanlangan tuman ushbu viloyatga tegishli emas" };
  }

  return { valid: true };
}

module.exports = { REGIONS, validateRegionDistrict };