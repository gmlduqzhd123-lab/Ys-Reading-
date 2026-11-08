import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
const f = JSON.parse(fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"));
test("class context, 28-record split export, resume and learning notification", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("학생 아이디 또는 선생님 이메일", { exact: true })
    .fill(f.accounts[1].email);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(f.accounts[1].password);
  await page
    .getByRole("button", { name: "내 교실로 들어가기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/hub/);
  await page
    .getByLabel("지금 보고 있는 학급", { exact: true })
    .selectOption(f.classroom);
  await expect(page).toHaveURL(new RegExp("classroom=" + f.classroom));
  await page
    .getByRole("link", { name: "기록·글 내보내기", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp("tab=exports.*classroom=" + f.classroom),
  );
  await page.getByLabel("묶음 제목", { exact: true }).fill("CI 학기 묶음");
  await page.getByLabel("기록 시작 날짜", { exact: true }).fill("2024-02-01");
  await page.getByLabel("기록 끝 날짜", { exact: true }).fill("2024-02-28");
  const downloaded: import("@playwright/test").Download[] = [];
  page.on("download", (d) => downloaded.push(d));
  await page
    .getByRole("button", { name: "조건에 맞는 묶음 만들기", exact: true })
    .click();
  await expect(
    page.getByText(
      "분할 파일 생성을 마쳤어요. 다운로드 목록 또는 Google 링크에서 파일을 확인해 주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("28건 · 2/2개 파일 생성", { exact: true }),
  ).toBeVisible();
  expect(downloaded).toHaveLength(2);
  const paths = await Promise.all(downloaded.map((d) => d.path()));
  const document = await JSZip.loadAsync(fs.readFileSync(paths[0]!));
  expect(await document.file("word/document.xml")!.async("text")).toContain(
    "CI 묶음 기록",
  );
  await page.reload();
  await expect(
    page.getByText("28건 · 2/2개 파일 생성", { exact: true }),
  ).toBeVisible();
  const baseline = page.waitForResponse(
    (r) => r.url().includes("/api/learning-changes") && r.status() === 200,
  );
  await page.goto("/hub?tab=overview");
  await baseline;
  await expect(
    page.getByLabel("지금 보고 있는 학급", { exact: true }),
  ).toHaveValue(f.classroom);
  const student = createClient(f.url, f.key, {
    auth: { persistSession: false },
  });
  const login = await student.auth.signInWithPassword({
    email: f.mobile.loginId + "@students.bookforest.invalid",
    password: f.mobile.password,
  });
  expect(login.error).toBeNull();
  const added = await student.rpc("hub_command", {
    p_command: "reading_save",
    p_payload: {
      classroomId: f.classroom,
      book: { title: "CI 새 활동 알림" },
      readOn: new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
      }).format(new Date()),
      status: "reading",
      thought: "새 기록 갱신 알림을 검증하는 합성 생각입니다.",
    },
    p_request_id: crypto.randomUUID(),
  });
  expect(added.error).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByText(
      "새 기록·제출·피드백이 있어요. 현재 입력은 그대로 두고 있습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "새 활동 불러오기", exact: true })
    .click();
  await expect(
    page.getByText(
      "새 기록·제출·피드백이 있어요. 현재 입력은 그대로 두고 있습니다.",
      { exact: true },
    ),
  ).toHaveCount(0);
});
