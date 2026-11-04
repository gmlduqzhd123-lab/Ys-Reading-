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
    .getByRole("checkbox", { name: "이 탭에 미저장 글 임시보관", exact: true })
    .check();
  await sc.setOffline(true);
  await student
    .getByLabel("글 제목", { exact: true })
    .fill("CI 생각을 나눈 글");
  await student
    .getByLabel("생각을 펼쳐 보세요", { exact: true })
    .fill(
      "책 속 친구의 마음을 생각했습니다. 서로의 생각을 듣고 도움을 주면 함께 성장할 수 있습니다.",
    );
  const recoveryDownload = student.waitForEvent("download");
  await student
    .getByRole("button", { name: "지금 쓴 글 파일로 보관", exact: true })
    .click();
  const recoveryFile = await recoveryDownload,
    recoveryPath = await recoveryFile.path();
  expect(fs.readFileSync(recoveryPath!, "utf8")).toContain("책 속 친구의 마음");
  await sc.setOffline(false);
  await student.getByRole("button", { name: /^(다시|지금) 저장하기$/ }).click();
  await expect(
    student
      .getByRole("status")
      .filter({ hasText: /저장했어요|저장 완료|저장됨/ })
      .first(),
  ).toBeVisible();
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
  await expect(
    student.getByRole("heading", { name: "CI 별 상품", exact: true }),
  ).toBeVisible();
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
    .getByRole("checkbox", {
      name: "활동 수치·선택한 원문·관찰 의견과 공개 범위를 직접 확인했습니다",
    })
    .check();
  await teacher
    .getByRole("button", { name: "확인한 보고서 새 판 저장", exact: true })
    .click();
  await expect(
    teacher.getByText(
      "보고서 초안을 새 판으로 저장했어요. 내용을 검토한 뒤 공개할 수 있습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await student.goto("/reports");
  await expect(
    student.getByRole("heading", { name: "CI 새싹의 책숲 성장 기록 · 1판" }),
  ).toHaveCount(0);
  await teacher
    .getByRole("checkbox", {
      name: "CI 새싹의 책숲 성장 기록 1판의 원문·수치·의견과 학생 공개 범위를 확인했습니다",
    })
    .check();
  await teacher
    .getByRole("button", { name: "이 판 검토 완료", exact: true })
    .click();
  await expect(
    teacher.getByText(
      "검토를 완료했어요. 공개 범위를 확인한 뒤 학생에게 공개하세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await teacher
    .getByRole("checkbox", {
      name: "CI 새싹의 책숲 성장 기록 1판의 원문·수치·의견과 학생 공개 범위를 확인했습니다",
    })
    .check();
  await teacher
    .getByRole("button", { name: "학생에게 공개", exact: true })
    .click();
  await expect(
    teacher.getByText("학생에게 공개했어요.", { exact: true }),
  ).toBeVisible();
  const fileEvent = teacher.waitForEvent("download");
  await teacher.getByRole("button", { name: "Word 저장", exact: true }).click();
  expect((await fileEvent).suggestedFilename()).toBe("bookforest-growth.docx");
  const popupEvent = teacher.waitForEvent("popup");
  await teacher
    .getByRole("button", { name: "인쇄 · PDF 저장", exact: true })
    .click();
  const printPage = await popupEvent;
  await expect(
    printPage.getByRole("heading", {
      name: "CI 새싹의 책숲 성장 기록",
      exact: true,
    }),
  ).toBeVisible();
  const pdf = await printPage.pdf({ format: "A4", printBackground: true });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await printPage.close();
  await student.goto("/reports");
  await expect(
    student.getByRole("heading", { name: "CI 새싹의 책숲 성장 기록 · 1판" }),
  ).toBeVisible();
  await teacher.goto("/account/records");
  await expect(
    teacher.getByText("CI 새싹의 책숲 성장 기록", { exact: true }).first(),
  ).toBeVisible();
  await teacher.goto("/collaboration?classroom=" + fixture.classroom);
  await teacher
    .getByLabel("초대할 승인 교사의 이메일", { exact: true })
    .fill(fixture.accounts[0].email);
  await teacher
    .getByRole("button", { name: "선택한 권한으로 교사 초대", exact: true })
    .click();
  const inviteCode = await teacher
    .getByLabel("이번 초대 코드", { exact: true })
    .inputValue();
  expect(inviteCode).toMatch(/^[a-f0-9]{64}$/);
  await operator.goto("/collaboration");
  await operator.getByLabel("초대 코드", { exact: true }).fill(inviteCode);
  await operator
    .getByRole("button", { name: "이 계정으로 초대 수락", exact: true })
    .click();
  await expect(
    operator.getByText("처리했어요. 현재 학급과 권한을 다시 확인해 주세요.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    operator.getByRole("heading", { name: "담당 학급 기록 읽기" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    operator.getByText("CI 새싹 · CI 함께 읽은 책", { exact: false }),
  ).toBeVisible();
  await teacher.reload();
  await operator.goto("/hub?tab=overview&classroom=" + fixture.classroom);
  await expect(
    operator.getByRole("heading", { name: "우리 반 현황·알림", exact: true }),
  ).toBeVisible();
  await operator.goto(
    "/hub?tab=search&classroom=" + fixture.classroom + "&q=CI",
  );
  await expect(
    operator.getByText("CI 함께 읽은 책", { exact: false }).first(),
  ).toBeVisible();
  await teacher
    .getByRole("button", { name: "공동교사 권한 취소", exact: true })
    .click();
  await expect(teacher.getByText(/CI operator.*취소됨/)).toBeVisible();
  await operator.reload();
  await expect(
    operator.getByRole("heading", { name: "담당 학급 기록 읽기" }),
  ).toHaveCount(0);
  for (const page of [student, teacher]) {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(391);
  }
  const studentApi = createClient(fixture.url, fixture.key, {
      auth: { persistSession: false },
    }),
    teacherApi = createClient(fixture.url, fixture.key, {
      auth: { persistSession: false },
    });
  await studentApi.auth.signInWithPassword({
    email: fixture.student.loginId + "@students.bookforest.invalid",
    password: fixture.student.password,
  });
  await teacherApi.auth.signInWithPassword({
    email: fixture.accounts[1].email,
    password: fixture.accounts[1].password,
  });
  const work = await studentApi
    .from("submissions")
    .select("id")
    .eq("status", "completed")
    .limit(1)
    .single();
  const shared = await studentApi.rpc("hub_command", {
    p_command: "plaza_share",
    p_payload: { id: work.data!.id, consent: true },
    p_request_id: crypto.randomUUID(),
  });
  expect(shared.error).toBeNull();
  const published = await teacherApi.rpc("hub_command", {
    p_command: "plaza_moderate",
    p_payload: { id: shared.data.id, status: "published" },
    p_request_id: crypto.randomUUID(),
  });
  expect(published.error).toBeNull();
  await student.goto("/hub?tab=plaza");
  await student.getByText("이 작품을 선생님께 알리기", { exact: true }).click();
  await student
    .getByLabel("선생님께 전할 말 · 선택")
    .fill("합성 작품의 공개 범위를 확인해 주세요.");
  await student
    .getByRole("button", { name: "선생님께 확인 요청", exact: true })
    .click();
  await expect(
    student.getByText("담당 선생님에게 확인을 요청했어요.", { exact: true }),
  ).toBeVisible();
  await teacher.goto("/hub?tab=plaza");
  teacher.once("dialog", (dialog) => dialog.accept());
  await teacher
    .getByRole("button", { name: "게시 중단·검토 완료", exact: true })
    .click();
  await expect(
    teacher.getByText("검토 결과를 기록했어요.", { exact: true }),
  ).toBeVisible();
  await student.reload();
  await expect(student.getByText(/검토 완료·게시 중단/)).toBeVisible();
  await tc.close();
  await oc.close();
  await sc.close();
});
