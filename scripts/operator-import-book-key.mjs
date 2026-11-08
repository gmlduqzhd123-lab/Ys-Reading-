import fs from "node:fs";
import path from "node:path";
let input = "";
try {
  for await (const c of process.stdin) {
    input += c;
    if (input.length > 2000) throw Error();
  }
  const { provider, key } = JSON.parse(input);
  input = "";
  if (
    !["aladin", "kakao"].includes(provider) ||
    typeof key !== "string" ||
    !/^[A-Za-z0-9_-]{10,200}$/.test(key)
  )
    throw Error();
  const url = new URL(
    provider === "kakao"
      ? "https://dapi.kakao.com/v3/search/book"
      : "https://www.aladin.co.kr/ttb/api/ItemSearch.aspx",
  );
  if (provider === "kakao") {
    url.searchParams.set("query", "어린 왕자");
    url.searchParams.set("size", "1");
  } else
    for (const [k, v] of Object.entries({
      ttbkey: key,
      Query: "어린 왕자",
      QueryType: "Keyword",
      MaxResults: "1",
      SearchTarget: "Book",
      output: "js",
      Version: "20131101",
    }))
      url.searchParams.set(k, v);
  const r = await fetch(url, {
      headers: provider === "kakao" ? { Authorization: "KakaoAK " + key } : {},
      signal: AbortSignal.timeout(10000),
    }),
    body = await r.json();
  if (
    !r.ok ||
    !Array.isArray(provider === "kakao" ? body.documents : body.item) ||
    body.errorCode
  )
    throw Error();
  const name = provider === "kakao" ? "KAKAO_BOOK_REST_KEY" : "ALADIN_TTB_KEY",
    file = path.resolve(import.meta.dirname, "../.env.local"),
    raw = fs.readFileSync(file, "utf8"),
    line = name + "=" + JSON.stringify(key),
    pattern = new RegExp("^" + name + "=.*$", "m");
  fs.writeFileSync(
    file,
    pattern.test(raw)
      ? raw.replace(pattern, () => line)
      : raw + "\n" + line + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({ imported: true, provider, connectionVerified: true }),
  );
} catch {
  console.error(
    JSON.stringify({ imported: false, code: "BOOK_PROVIDER_KEY_NOT_VERIFIED" }),
  );
  process.exitCode = 1;
}
