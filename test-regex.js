const html = "<pre style=\"font-family: 'Courier New', Courier, monospace; margin: 0; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word; color: #fff;\">╭────────────────────────╮\n         933PAY\n╰────────────────────────╯\n\n【存款订单】\n\n订单号 │ TX1863BC5C29DD4B8D\n金额   │ 1.400.000 VND VND\n\n银行   │ TPB\n姓名   │ Dao Phuc Giang\n账号   │ 0223249051\n\n状态   │ 待处理\n\n────────────────────────\n\n.bank   .name   .bil</pre>";
const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
if (preMatch) {
    console.log("MATCHED!");
    const innerText = preMatch[1].replace(/<[^>]*>/g, "");
    console.log(`<pre>${innerText}</pre>`);
} else {
    console.log("NO MATCH");
}
