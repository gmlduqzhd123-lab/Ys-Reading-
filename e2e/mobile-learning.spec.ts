import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import JSZip from "jszip";
const f = JSON.parse(fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"));
test("mobile authenticated Korean writing, reload, reconnect, export and accessibility", async ({
  page,
  context,
}) => {
  await page.goto("/login");
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
  await expect(page).toHaveURL(/\/hub|\/account/);
  await page.goto("/app/work/" + f.assignment);
  await page
    .getByLabel("글 제목", { exact: true })
    .fill("모바일에서 함께 쓰는 한글");
  const body = page.getByLabel("생각을 펼쳐 보세요", { exact: true });
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
  await page.goto("/device-check");
  await page.getByLabel("지금 점검하는 기기").selectOption("개인 PC·휴대전화");
  await page
    .getByRole("button", { name: "이 기기 연결 검사", exact: true })
    .click();
  await expect(page.getByText(/실제 서버 응답: 정상/)).toBeVisible();
});
