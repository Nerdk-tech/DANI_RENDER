async function helpCommand(sock, chatId, message) {
  const menu =
`*Dani* — Digital Artificial Neural Intelligence
_daniai.vercel.app_

*Chat & AI*
Talk naturally. "dani [anything]" or just ask in DM.
.ai [question] / .dani [question]

*Images*
create an image of [description]
edit [instructions] — reply to any image
.image [prompt] / .edit [prompt]

*Video*
dani video [description]
.video [prompt]
_Takes 2-4 minutes_

*Review*
dani review — reply to any image or file
dani review [instructions]

*Music*
play [song] / dani play [song]
.play [song name or YouTube link]

*Lyrics*
dani lyrics [song name + artist]
.lyrics [song]

*Voice*
say [text] / dani say [text]
transcribe — reply to voice note
.say [text] / .transcribe

*Weather*
weather [city] / dani weather in [city]

*Search*
search [query] / dani search [query]

*Virtual Numbers & OTP*
dani country — see available countries
dani number [country] — get a virtual number
dani otp [number] — check received messages

*VCF — Status Views*
dani vcf join — add yourself
dani vcf status — check if open
dani vcf open/close/send/clear

*Games*
dani game — see all games
dani game trivia / riddle / wyr / roast
dani game truth / dare / story

*Roleplay*
dani roleplay — see sections
dani roleplay romance / friend / villain
dani roleplay custom [describe character]
dani roleplay stop

*Group Tools*
dani group antihijack on/off
dani group antilink on/off
dani group welcome on/off
dani tagall [message]

*Settings*
dani settings — open panel
dani settings off / on / noprefix / reset

*Endpoint Checker*
dani ping — check all systems
dani ping [url] — check specific URL

*Terminal*
run [command] / .run [command]

_Memory resets when you say "reset"._`;

  return sock.sendMessage(chatId, { text: menu }, { quoted: message });
}
module.exports = helpCommand;
