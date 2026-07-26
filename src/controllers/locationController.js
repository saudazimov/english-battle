function createLocationController({ getCountries, getStates, getCities }) {
  function countries(req, res) {
    return res.json({ countries: getCountries() });
  }

  function states(req, res) {
    const country = String(req.query.country || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      return res.status(400).json({ error: "Davlat kodi noto'g'ri" });
    }
    return res.json({ states: getStates(country) });
  }

  function cities(req, res) {
    const country = String(req.query.country || "").toUpperCase();
    const state = String(req.query.state || "");
    if (!/^[A-Z]{2}$/.test(country) || !state) {
      return res.status(400).json({ error: "Davlat va viloyat kodi kerak" });
    }
    return res.json({ cities: getCities(country, state) });
  }

  return { countries, states, cities };
}

module.exports = { createLocationController };
