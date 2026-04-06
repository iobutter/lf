async function run() {
  try {
    const res = await fetch("https://api.ransomware.live/chats");
    const text = await res.text();
    console.log(text.substring(0, 500));
  } catch (e) {
    console.error(e.message);
  }
}
run();
