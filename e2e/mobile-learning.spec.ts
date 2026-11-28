import { test, expect } from "./checked-test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import JSZip from "jszip";
const f = JSON.parse(fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"));
test("mobile teacher returns to class setup and can open the review queue", async ({ page }) => {
  await page.goto("/");
  await page.locator(".paper-home-intro").getByRole("link", { name: "교사 시작", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?mode=teacher&intent=classroom/);
  const password = page.locator(".login-password-option");
  await password.locator("summary").click();
  await password.getByLabel("선생님 이메일", { exact: true }).fill(f.accounts[1].email);
  await password.getByLabel("비밀번호", { exact: true }).fill(f.accounts[1].password);
  await password.getByRole("button", { name: "비밀번호로 로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/start\?mode=new/);
  await expect(page.getByRole("textbox", { name: "새 학급 이름", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.getByRole("navigation", { name: "주 메뉴", exact: true })
    .getByRole("link", { name: "학생 기록 확인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "학생 기록 확인", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "기록 종류", exact: true })).toHaveValue("writing");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
test("mobile authenticated Korean writing, reload, reconnect, export and accessibility", async ({
  page,
  context,
  browser,
}) => {
  const destination = "/hub?tab=today&classroom=" + f.classroom;
  await page.goto(destination);
  await expect(page).toHaveURL(/\/login\?.*next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(destination);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "본문으로 바로가기" }),
  ).toBeFocused();
  let axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    axe.violations.map((x) => ({
      id: x.id,
      impact: x.impact,
      nodes: x.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page
    .getByLabel("학생 아이디 또는 선생님 이메일", { exact: true })
    .fill(f.mobile.loginId);
  await page.getByLabel("비밀번호", { exact: true }).fill(f.mobile.password);
  await page
    .getByRole("button", { name: "내 교실로 들어가기", exact: true })
    .click();
  await expect(page).toHaveURL(destination);
  const next = page.getByRole("region", { name: "지금 할 일" });
  await expect(next.getByText(/마감/)).toBeVisible();
  const menu = page.getByRole("navigation", { name: "교실 바로가기", exact: true });
  await expect(menu.getByRole("link", { name: "받은 피드백", exact: true }))
    .toHaveAttribute("href", "/app?view=feedback&classroom=" + f.classroom);
  const viewSettings = page.locator(".view-settings");
  await viewSettings.locator("summary").click();
  await viewSettings.getByLabel("큰 글씨", { exact: true }).check();
  await viewSettings.locator("summary").click();
  await expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  const taskButton = await next.getByRole("link").boundingBox();
  expect(taskButton?.height).toBeGreaterThanOrEqual(44);
  await viewSettings.locator("summary").click();
  await viewSettings.getByLabel("큰 글씨", { exact: true }).uncheck();
  await viewSettings.locator("summary").click();
  await next.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp("/app/work/" + f.assignment));
  await expect(page.getByRole("link", { name: "오늘 할 일로 돌아가기", exact: true }))
    .toHaveAttribute("href", "/hub?tab=today&classroom=" + f.classroom);
  await page
    .getByLabel("글 제목", { exact: true })
    .fill("모바일에서 함께 쓰는 한글");
  const body = page.getByLabel("생각을 펼쳐 보세요", { exact: true });
  const question = page.getByRole("heading", { name: "오늘의 생각 질문", exact: true });
  expect((await question.boundingBox())!.y).toBeLessThan((await body.boundingBox())!.y);
  await body.fill(
    "작은 화면에서도 친구의 생각을 읽고 내 생각을 차분히 썼습니다. 한글 글자가 새로고침 뒤에도 그대로 남습니다.",
  );
  await expect(page.getByText(/저장했어요/).first()).toBeVisible();
  await page.reload();
  await expect(body).toHaveValue(/한글 글자/);
  await expect(page.getByLabel("글 제목", { exact: true })).toHaveValue(
    "모바일에서 함께 쓰는 한글",
  );
  await page
    .getByRole("checkbox", { name: "이 탭에 미저장 글 임시보관", exact: true })
    .check();
  await context.setOffline(true);
  await body.fill(
    (await body.inputValue()) + " 연결이 끊긴 동안 보탠 문장입니다.",
  );
  await expect(
    page.getByText(/연결이 끊|오프라인|저장.*확인하지 못/).first(),
  ).toBeVisible();
  await context.setOffline(false);
  await page
    .getByRole("button", { name: /^(지금 저장하기|다시 저장하기)$/ })
    .click();
  await expect(page.getByText(/저장했어요/).first()).toBeVisible();
  await page.reload();
  await expect(body).toHaveValue(/보탠 문장/);
  axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    axe.violations.map((x) => ({
      id: x.id,
      impact: x.impact,
      nodes: x.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.goto("/hub?tab=exports");
  await page.getByLabel("기록 종류").selectOption("drafts");
  await expect(page.getByLabel("기록 종류")).toHaveValue("drafts");
  await page
    .getByRole("checkbox", { name: /모바일에서 함께 쓰는 한글/ })
    .check();
  const pendingDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Word 파일 저장", exact: true })
    .click();
  const download = await pendingDownload,
    path = await download.path();
  expect(path).not.toBeNull();
  const zip = await JSZip.loadAsync(fs.readFileSync(path!));
  expect(await zip.file("word/document.xml")!.async("text")).toContain(
    "보탠 문장",
  );
  await page.goto("/app/work/" + f.assignment + "?classroom=" + f.classroom);
  await page.getByRole("button", { name: "선생님께 제출하기", exact: true }).click();
  await expect(page.getByText("선생님께 제출됨", { exact: true })).toBeVisible();

  const teacherContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const teacher = await teacherContext.newPage();
    const review = "/hub?tab=review&classroom=" + f.classroom;
    await teacher.goto(new URL("/login?mode=teacher&" + new URLSearchParams({ next: review }), page.url()).href);
    const password = teacher.locator(".login-password-option");
    await password.locator("summary").click();
    await password.getByLabel("선생님 이메일", { exact: true }).fill(f.accounts[1].email);
    await password.getByLabel("비밀번호", { exact: true }).fill(f.accounts[1].password);
    await password.getByRole("button", { name: "비밀번호로 로그인", exact: true }).click();
    await expect(teacher).toHaveURL(new URL(review, page.url()).href);
    const list = teacher.getByRole("region", { name: "검토할 기록", exact: true });
    await list.getByRole("button", { name: /모바일에서 함께 쓰는 한글/ }).click();
    await expect(list).toBeHidden();
    const detail = teacher.getByRole("region", { name: /모바일에서 함께 쓰는 한글/ });
    await detail.getByRole("checkbox", { name: "이 기록을 읽고 확인했어요", exact: true }).check();
    await detail.getByLabel("피드백", { exact: true }).fill("어떤 장면을 읽고 그렇게 생각했는지 적어 보세요.");
    await detail.getByLabel("검토 결과").selectOption("revision_requested");
    await detail.getByRole("button", { name: "고쳐쓰기 피드백 보내기", exact: true }).click();
    await expect(teacher.getByText("1건의 글에 고쳐쓰기 피드백을 전했어요.", { exact: true })).toBeVisible();
  } finally {
    await teacherContext.close();
  }
  await page.goto(destination);
  await page.getByRole("region", { name: "지금 할 일" })
    .getByRole("link", { name: "피드백 읽고 고쳐 쓰기", exact: true }).click();
  const feedback = page.getByRole("region", { name: "선생님의 피드백" });
  await expect(feedback.getByText("어떤 장면을 읽고 그렇게 생각했는지 적어 보세요.", { exact: true })).toBeVisible();
  expect((await feedback.boundingBox())!.y).toBeLessThan((await question.boundingBox())!.y);
  await expect(body).toBeEditable();

  await page.goto("/device-check");
  await page.getByLabel("지금 점검하는 기기").selectOption("개인 PC·휴대전화");
  await page
    .getByRole("button", { name: "이 기기 연결 검사", exact: true })
    .click();
  await expect(page.getByText(/실제 서버 응답: 정상/)).toBeVisible();
});
