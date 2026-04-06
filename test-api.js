async function run() {
  try {
    const res = await fetch("https://api-pro.ransomware.live/negotiations", {
      headers: { "X-API-KEY": "a72505f5-af2c-4b8b-95be-b28674f7ef72" }
    });
    const data = await res.json();
    console.log(JSON.stringify(data).substring(0, 500));
  } catch (e) {
    console.error(e.message);
  }
}
run();
