import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { totp } from "./totp";
const fixture = JSON.parse(
  fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"),
);
async function login(page: Page, id: string, password: string) {
  await page.goto("/login");
  await page
    .getByLabel("학생 아이디 또는 선생님 이메일", { exact: true })
    .fill(id);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "내 교실로 들어가기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/hub|\/account/);
}
test("real Auth, consent, reading, writing, review, rewards and economy journey", async ({
  browser,
}) => {
  const tc = await browser.newContext(),
    oc = await browser.newContext(),
    sc = await browser.newContext();
  const teacher = await tc.newPage(),
    operator = await oc.newPage(),
    student = await sc.newPage();
  await login(
    operator,
    fixture.accounts[0].email,
    fixture.accounts[0].password,
  );
  await operator.goto("/account/security");
  await operator
    .getByLabel("인증앱의 6자리 번호")
    .fill(totp(fixture.operatorSecret));
  await operator
    .getByRole("button", { name: "2단계 인증 확인", exact: true })
    .click();
  await expect(
    operator.getByText("2단계 인증을 확인했어요. 중요 작업을 이어가세요.", {
      exact: true,
    }),
  ).toBeVisible();
  await operator.goto("/operations");
  await operator
    .getByText("자료를 확인한 동의 요청 함께 승인", { exact: true })
    .click();
  await operator
    .getByRole("checkbox", { name: /CI 새싹.*CI-SYNTHETIC-CONSENT/ })
    .check();
  await operator
    .getByRole("button", { name: "자료 확인한 1건 승인", exact: true })
    .click();
  await expect(
    operator.getByText("1건을 승인했어요.", { exact: true }),
  ).toBeVisible();
  await login(student, fixture.student.loginId, fixture.student.password);
  await student.goto("/hub?tab=reading#reading-editor");
  await student.getByLabel("책 제목", { exact: true }).fill("CI 함께 읽은 책");
  await student.getByLabel("저자", { exact: true }).fill("CI 저자");
  await student.getByLabel("독서 상태").selectOption("completed");
  await student
    .getByLabel("기억에 남는 장면과 나의 생각", { exact: true })
    .fill("친구를 도와주는 장면을 읽고 나도 먼저 손을 내밀기로 했습니다.");
  await student
    .getByRole("button", { name: "독서 기록 저장하기", exact: true })
    .click();
  await expect(
    student.getByText(
      "독서 기록을 저장했어요. 아래 내 기록에서 확인할 수 있습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await student.goto("/app/work/" + fixture.assignment);
  await student
    .getByLabel("글 제목", { exact: true })
    .fill("CI 생각을 나눈 글");
  await student
    .getByLabel("생각을 펼쳐 보세요", { exact: true })
    .fill(
      "책 속 친구의 마음을 생각했습니다. 서로의 생각을 듣고 도움을 주면 함께 성장할 수 있습니다.",
    );
  await student
    .getByRole("button", { name: "선생님께 제출하기", exact: true })
    .click();
  await expect(
    student.getByText(/1번째 글을 선생님께 제출했어요/),
  ).toBeVisible();
  await login(teacher, fixture.accounts[1].email, fixture.accounts[1].password);
  await teacher.goto("/hub?tab=review");
  await teacher
    .locator("summary")
    .filter({ hasText: "CI 생각을 나눈 글" })
    .click();
  await teacher
    .getByRole("checkbox", { name: "이 기록을 읽고 확인했어요" })
    .check();
  await teacher
    .getByLabel("피드백", { exact: true })
    .fill("친구의 마음을 근거와 함께 표현했어요.");
  await teacher
    .getByRole("button", { name: "선택한 최신 글 검토 완료", exact: true })
    .click();
  await expect(
    teacher.getByText("1건의 작품을 완료했어요.", { exact: true }),
  ).toBeVisible();
  await teacher.goto("/hub?tab=review&reviewKind=reading");
  await teacher
    .locator("summary")
    .filter({ hasText: "CI 함께 읽은 책" })
    .click();
  await teacher
    .getByRole("checkbox", { name: "이 기록을 읽고 확인했어요" })
    .check();
  await teacher
    .getByRole("button", { name: "읽은 기록 확인·보상 반영", exact: true })
    .click();
  await expect(
    teacher.getByText("1건의 독서 기록 확인을 마쳤어요.", { exact: true }),
  ).toBeVisible();
  await student.reload();
  await expect(
    student.getByText("미션을 완료했어요", { exact: true }),
  ).toBeVisible();
  const learner = createClient(fixture.url, fixture.key, {
    auth: { persistSession: false },
  });
  const signed = await learner.auth.signInWithPassword({
    email: fixture.student.loginId + "@students.bookforest.invalid",
    password: fixture.student.password,
  });
  expect(signed.error).toBeNull();
  const before = await learner.rpc("hub_summary");
  expect(before.error).toBeNull();
  expect(before.data.xp).toBeGreaterThan(0);
  const balance = before.data.balances[fixture.classroom];
  expect(balance).toBeGreaterThanOrEqual(3);
  await student.goto("/hub?tab=economy");
  await student
    .getByRole("button", { name: "구매 예약하기", exact: true })
    .click();
  await expect(
    student.getByText("처리했어요. 최신 기록에 반영되었습니다.", {
      exact: true,
    }),
  ).toBeVisible();
  const after = await learner.rpc("hub_summary");
  expect(after.data.balances[fixture.classroom]).toBe(balance - 3);
  await expect(student.getByText("CI 별 상품")).toBeVisible();
  await teacher.goto(
    "/reports?classroom=" +
      fixture.classroom +
      "&student=" +
      fixture.student.id,
  );
  await expect(
    teacher.getByRole("heading", { name: "CI 새싹의 보고서 준비" }),
  ).toBeVisible();
  await teacher
    .getByRole("checkbox", { name: "CI 생각을 나눈 글 · 1번째 글" })
    .check();
  await teacher
    .getByLabel("선생님의 관찰과 응원")
    .fill("원문을 읽고 친구의 마음을 담은 표현을 확인했습니다.");
  await teacher
    .getByRole("checkbox", { name: "저장한 판을 이 학생에게 공개합니다" })
    .check();
  await teacher
    .getByRole("checkbox", {
      name: "활동 수치·선택한 원문·관찰 의견과 공개 범위를 직접 확인했습니다",
    })
    .check();
  await teacher
    .getByRole("button", { name: "확인한 보고서 새 판 저장", exact: true })
    .click();
  await expect(
    teacher.getByText("확인한 보고서를 새 판으로 저장했어요.", { exact: true }),
  ).toBeVisible();
  const fileEvent = teacher.waitForEvent("download");
  await teacher.getByRole("button", { name: "Word 저장", exact: true }).click();
  expect((await fileEvent).suggestedFilename()).toBe("bookforest-growth.docx");
  await student.goto("/reports");
  await expect(
    student.getByRole("heading", { name: "CI 새싹의 책숲 성장 기록 · 1판" }),
  ).toBeVisible();
  await teacher.goto("/account/records");
  await expect(
    teacher.getByText("CI 새싹의 책숲 성장 기록", { exact: true }),
  ).toBeVisible();
  await tc.close();
  await oc.close();
  await sc.close();
});
