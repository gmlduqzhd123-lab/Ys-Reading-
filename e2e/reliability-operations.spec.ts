import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { watchBrowserErrors } from "./browser-errors";
const f = JSON.parse(fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"));
async function login(p: Page) {
  await p.goto("/login");
  await p
    .getByLabel("학생 아이디 또는 선생님 이메일", { exact: true })
    .fill(f.accounts[1].email);
  await p.getByLabel("비밀번호", { exact: true }).fill(f.accounts[1].password);
  await p
    .getByRole("button", { name: "내 교실로 들어가기", exact: true })
    .click();
  await expect(p).toHaveURL(/\/hub/);
}
function access(p: Page) {
  return p
    .getByLabel("수업 입력 임시 보관 상태", { exact: true })
    .first()
    .locator("details")
    .first();
}
test("private-device encrypted recovery survives reload, prevents tab overwrite and shows scoped weekly evidence", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const check = watchBrowserErrors(page),
    pass = "CI-private-device-passphrase-2026",
    text = "암호화 보관만 확인하는 합성 제목 " + Date.now(),
    path = "/classroom?section=maker&classroom=" + f.workshop.classroom;
  await check.ready;
  await login(page);
  await context.route("**/*", (route) => {
    const r = route.request();
    if (
      r.headers()["next-action"] &&
      new URL(r.url()).pathname.startsWith("/classroom")
    )
      return route.abort("failed");
    return route.continue();
  });
  await page.goto(path);
  const title = page.getByLabel("활동 제목", { exact: true });
  await expect(title).toBeVisible();
  await expect(
    page.getByLabel("수업 입력 임시 보관 상태", { exact: true }).first(),
  ).toBeVisible();
  await access(page).locator("summary").first().click();
  await access(page)
    .getByLabel("본인만 사용하는 개인 기기입니다", { exact: true })
    .check();
  await access(page).getByLabel("기기 보관 암호", { exact: true }).fill(pass);
  await access(page)
    .getByLabel("기기 보관 암호 다시 입력", { exact: true })
    .fill(pass);
  await access(page)
    .getByRole("button", {
      name: "이 개인 기기에 암호화 보관 설정",
      exact: true,
    })
    .click();
  await expect(
    access(page).getByText("이 기기의 암호화 초안 보관을 열었어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        "이 기기의 암호화 초안도 보관했어요. 정식 저장·제출은 별도입니다.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  const before = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter(
        (k) => k.startsWith("bookforest.personal.v1:") && k.includes(":draft:"),
      )
      .map((k) => localStorage.getItem(k))
      .join(""),
  );
  await context.setOffline(true);
  await title.fill(text);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter(
            (k) =>
              k.startsWith("bookforest.personal.v1:") && k.includes(":draft:"),
          )
          .map((k) => localStorage.getItem(k))
          .join(""),
      ),
    )
    .not.toBe(before);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter(
            (k) =>
              k.startsWith("bookforest.personal.v1:") && k.includes(":draft:"),
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page
        .getByText(
          "이 기기의 암호화 초안도 보관했어요. 정식 저장·제출은 별도입니다.",
          { exact: true },
        )
        .count(),
    )
    .toBeGreaterThan(0);
  await expect(page.getByText("이 기기에 암호화 초안 저장됨", { exact: true }).first()).toBeVisible();
  const raw = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("bookforest.personal.v1:"))
      .map((k) => localStorage.getItem(k))
      .join(""),
  );
  expect(raw).not.toContain(text);
  expect(raw).not.toContain(pass);
  await context.setOffline(false);
  await page.reload();
  await expect(title).not.toHaveValue(text);
  await access(page).locator("summary").first().click();
  await access(page)
    .getByLabel("본인만 사용하는 개인 기기입니다", { exact: true })
    .check();
  await access(page).getByLabel("기기 보관 암호", { exact: true }).fill(pass);
  await access(page)
    .getByRole("button", { name: "기기 초안 보관 열기", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "기기 초안 불러오기", exact: true })
      .first(),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "기기 초안 불러오기", exact: true })
    .first()
    .click();
  await expect(title).toHaveValue(text);
  await expect(
    page
      .getByText(
        "이 기기의 암호화 초안도 보관했어요. 정식 저장·제출은 별도입니다.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  const second = await context.newPage(),
    checkSecond = watchBrowserErrors(second);
  await checkSecond.ready;
  await second.goto(path);
  await access(second).locator("summary").first().click();
  await access(second)
    .getByLabel("본인만 사용하는 개인 기기입니다", { exact: true })
    .check();
  await access(second).getByLabel("기기 보관 암호", { exact: true }).fill(pass);
  await access(second)
    .getByRole("button", { name: "기기 초안 보관 열기", exact: true })
    .click();
  await expect(
    second
      .getByRole("button", { name: "기기 초안 불러오기", exact: true })
      .first(),
  ).toBeVisible();
  second.once("dialog", (d) => d.accept());
  await second
    .getByRole("button", { name: "기기 초안 불러오기", exact: true })
    .first()
    .click();
  await expect(second.getByLabel("활동 제목", { exact: true })).toHaveValue(
    text,
  );
  await expect(
    second
      .getByText(
        "이 기기의 암호화 초안도 보관했어요. 정식 저장·제출은 별도입니다.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await title.fill(text + " 다른 탭과 충돌");
  await expect(
    page
      .getByText(
        "다른 탭의 암호화 초안이 바뀌었어요. 보관본을 다시 읽고 현재 입력과 비교해 주세요.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await expect(title).toHaveValue(text + " 다른 탭과 충돌");
  await expect(second.getByLabel("활동 제목", { exact: true })).toHaveValue(
    text,
  );
  await page.goto("/hub?tab=overview&classroom=" + f.workshop.classroom);
  await expect(
    page.getByRole("heading", { name: "교사 주간 학습 요약", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "날짜별 독서·글쓰기·피드백", exact: true })
      .getByRole("row"),
  ).toHaveCount(8);
  check();
  checkSecond();
  await second.close();
});
