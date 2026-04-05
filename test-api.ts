import axios from "axios";

async function run() {
  try {
    const res = await axios.get("https://api-pro.ransomware.live/victims/recent", {
      headers: { "X-API-KEY": "a72505f5-af2c-4b8b-95be-b28674f7ef72" }
    });
    console.log(Object.keys(res.data[0]));
  } catch (e) {
    console.error(e.message);
  }
}
run();
