const axios = require('axios');

async function weatherCommand(sock, chatId, message, city) {
  if (!city) return sock.sendMessage(chatId, { text: `Which city?` }, { quoted: message });
  try {
    const key = process.env.OPENWEATHER_KEY;
    const { data } = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`,
      { timeout: 20000 }
    );
    const cond = data.weather?.[0]?.description;
    const out =
      `${data.name} right now\n` +
      `${data.main?.temp}°C, feels like ${data.main?.feels_like}°C\n` +
      `${cond.charAt(0).toUpperCase() + cond.slice(1)}\n` +
      `Humidity ${data.main?.humidity}%, wind ${data.wind?.speed} m/s`;
    return sock.sendMessage(chatId, { text: out }, { quoted: message });
  } catch {
    return sock.sendMessage(chatId, { text: `Couldn't get weather for ${city}. Check the city name.` }, { quoted: message });
  }
}
module.exports = weatherCommand;
