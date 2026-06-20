// api.js — Himoyalangan so'rovlar uchun yordamchi
// Bu fayl har bir so'rovga avtomatik JWT token qo'shadi.

function getToken() {
  return localStorage.getItem("token");
}

async function authFetch(url, options) {
  if (!options) options = {};

  const token = getToken();
  const headers = options.headers ? Object.assign({}, options.headers) : {};

  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  const newOptions = Object.assign({}, options);
  newOptions.headers = headers;

  const response = await fetch(url, newOptions);

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    const path = window.location.pathname;
    if (!path.includes("index.html") && path !== "/") {
      window.location.href = "/index.html";
    }
  }

  return response;
}