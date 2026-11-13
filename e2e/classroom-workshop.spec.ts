import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { watchBrowserErrors } from "./browser-errors";
const f = JSON.parse(fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"));
async function login(p: Page, id: string, password: string) {
  await p.goto("/login");
  await p
    .getByLabel("학생 아이디 또는 선생님 이메일", { exact: true })
    .fill(id);
  await p.getByLabel("비밀번호", { exact: true }).fill(password);
  await p
    .getByRole("button", { name: "내 교실로 들어가기", exact: true })
    .click();
  await expect(p).toHaveURL(/\/hub/);
}
test("ten classroom improvements with real teacher, student and anonymous family flows", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const tc = await browser.newContext(),
    sc = await browser.newContext(),
    pc = await browser.newContext(),
    teacher = await tc.newPage(),
    student = await sc.newPage(),
    parent = await pc.newPage();
  const checks = [teacher, student, parent].map(watchBrowserErrors),
    path = "/classroom?section=all&classroom=" + f.workshop.classroom;
  await login(teacher, f.accounts[1].email, f.accounts[1].password);
  await teacher.goto(path);
  await teacher
    .getByLabel("간편 독서 기록 필수 항목", { exact: true })
    .selectOption("both");
  await teacher
    .getByRole("button", { name: "학급 독서 기준 저장", exact: true })
    .click();
  await expect(
    teacher.getByLabel("간편 독서 기록 필수 항목", { exact: true }),
  ).toHaveValue("both");
  await teacher.getByLabel("활동 제목", { exact: true }).fill("CI 공방 활동");
  await teacher
    .getByRole("button", { name: "학생 활동 미리보기", exact: true })
    .click();
  const preview = teacher.getByLabel("작성 중인 활동 학생 미리보기", {
    exact: true,
  });
  await expect(
    preview.getByText("시연 · 실제 제출·보상은 발생하지 않아요", {
      exact: true,
    }),
  ).toBeVisible();
  const download = teacher.waitForEvent("download");
  await preview
    .getByRole("button", { name: "이 편집본 인쇄 파일", exact: true })
    .click();
  const file = await download;
  expect(fs.readFileSync((await file.path())!, "utf8")).toContain(
    "CI 공방 활동",
  );
  await teacher
    .getByRole("button", { name: "활동 양식 서버에 저장", exact: true })
    .click();
  const template = teacher
    .locator("#maker .tool-card")
    .filter({ hasText: "CI 공방 활동" });
  await expect(template).toHaveCount(1);
  await template
    .getByRole("button", { name: "학급 배부 내용 확인", exact: true })
    .click();
  await teacher
    .getByRole("button", { name: "확인하고 우리 반에 배부", exact: true })
    .click();
  await expect(
    teacher
      .locator("#activities")
      .getByRole("heading", { name: "CI 공방 활동", exact: true }),
  ).toBeVisible();
  await teacher
    .getByText("이 학급의 학생 화면 수업 시연", { exact: true })
    .click();
  const demo = teacher.locator("details.tool-preview");
  await expect(
    demo.getByText(
      "가상 학생 ‘새싹’의 시연입니다. 실제 학생으로 로그인하거나 제출·보상을 변경하지 않습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    demo.getByRole("button", { name: "활동 제출", exact: true }),
  ).toHaveCount(0);
  await login(student, f.workshop.student.loginId, f.workshop.student.password);
  const quick = student.getByLabel("오늘의 간편 독서 기록", { exact: true });
  await quick
    .getByLabel("오늘 읽은 책 제목", { exact: true })
    .fill("CI 새싹의 책");
  await quick
    .getByRole("button", { name: "이 책으로 오늘 기록하기", exact: true })
    .click();
  await quick
    .getByLabel("기억에 남는 구절", { exact: true })
    .fill("씨앗은 물을 먹고 나무로 자랐습니다.");
  await quick
    .getByLabel("오늘의 한 줄 생각", { exact: true })
    .fill("돌봄이 자람으로 이어진다고 생각합니다.");
  await quick
    .getByRole("button", { name: "오늘 독서 기록 저장", exact: true })
    .click();
  await expect(
    quick.getByText(
      "독서 기록을 저장했어요. 완독·보상은 선생님의 별도 확인으로 이어집니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await student.goto(path);
  const activity = student.locator("#activities .tool-card").filter({
    has: student.getByRole("heading", { name: "CI 공방 활동", exact: true }),
  });
  await expect(activity.locator("textarea")).toHaveCount(3);
  for (const area of await activity.locator("textarea").all())
    await area.fill("씨앗에 물을 주는 장면을 보고 인물의 마음을 생각했어요.");
  await activity
    .getByRole("button", { name: "활동 제출", exact: true })
    .click();
  await expect(
    activity.getByText("나의 1번째 제출 · 선생님 확인 대기", { exact: true }),
  ).toBeVisible();
  await teacher.reload();
  await teacher
    .getByRole("textbox", { name: "CI 공방 학생에게 피드백", exact: true })
    .fill("그 생각의 근거를 조금 더 구체적으로 적어 주세요.");
  await teacher
    .getByRole("button", { name: "고쳐쓰기 요청", exact: true })
    .click();
  await expect(
    teacher
      .locator("#activities")
      .getByText(
        "고쳐쓰기 요청 · 그 생각의 근거를 조금 더 구체적으로 적어 주세요.",
        { exact: true },
      ),
  ).toBeVisible();
  await student.reload();
  await activity
    .locator("textarea")
    .first()
    .fill("인물이 매일 물을 준 장면을 근거로 꾸준한 돌봄을 생각했어요.");
  await activity
    .getByRole("button", { name: "고친 활동 제출", exact: true })
    .click();
  await expect(
    activity.getByText("나의 2번째 제출 · 선생님 확인 대기", { exact: true }),
  ).toBeVisible();
  await teacher.reload();
  await teacher
    .getByRole("textbox", { name: "CI 공방 학생에게 피드백", exact: true })
    .fill("장면과 나의 생각을 연결했어요.");
  await teacher
    .getByRole("button", { name: "활동 확인·보상 반영", exact: true })
    .click();
  await expect(
    teacher
      .locator("#activities")
      .getByText("확인 완료 · 장면과 나의 생각을 연결했어요.", { exact: true }),
  ).toBeVisible();
  await student.reload();
  await student
    .getByLabel("한 주에 기록을 남길 나의 목표", { exact: true })
    .selectOption("2");
  await student
    .getByRole("button", { name: "나의 독서 리듬 저장", exact: true })
    .click();
  const discovery = student
    .getByRole("heading", { name: "아직 발견하지 못한 3번 장소", exact: true })
    .locator("..");
  await discovery
    .getByRole("button", { name: "새 장소 발견하기", exact: true })
    .click();
  await expect(
    student.getByRole("heading", { name: "여우의 생각 쉼터", exact: true }),
  ).toBeVisible();
  await student.reload();
  await expect(
    student.getByLabel("한 주에 기록을 남길 나의 목표", { exact: true }),
  ).toHaveValue("2");
  await expect(
    student.getByRole("heading", { name: "여우의 생각 쉼터", exact: true }),
  ).toBeVisible();
  await teacher
    .getByText("교실·학교 보유 도서 CSV 등록", { exact: true })
    .click();
  await teacher
    .getByLabel("보유 도서 CSV 파일", { exact: true })
    .setInputFiles({
      name: "library.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "ISBN,제목,저자,위치,권수\n9788936434120,CI 교실 도서,책숲,2번 책장,2\n",
        "utf8",
      ),
    });
  await teacher
    .getByRole("button", { name: "확인한 도서 목록 등록", exact: true })
    .click();
  await expect(
    teacher
      .locator("#library")
      .getByRole("heading", { name: "CI 교실 도서", exact: true }),
  ).toBeVisible();
  await student.goto(path);
  await student
    .getByLabel("보유 도서 검색어", { exact: true })
    .fill("CI 교실");
  await student
    .getByRole("button", { name: "보유 도서 검색", exact: true })
    .click();
  await expect(
    student
      .locator("#library")
      .getByRole("heading", { name: "CI 교실 도서", exact: true }),
  ).toBeVisible();
  await teacher.reload();
  await teacher.getByLabel("활동 종류", { exact: true }).selectOption("quiz");
  await teacher
    .getByLabel("활동 제목", { exact: true })
    .fill("CI 생각 다리 퀴즈");
  while ((await teacher.locator(".tool-question").count()) > 1) {
    const count = await teacher.locator(".tool-question").count();
    await teacher
      .locator(".tool-question")
      .last()
      .getByRole("button", { name: "이 질문 지우기", exact: true })
      .click();
    await expect(teacher.locator(".tool-question")).toHaveCount(count - 1);
  }
  await teacher
    .getByLabel("질문 내용", { exact: true })
    .fill("씨앗은 무엇으로 자랐나요?");
  await teacher.getByLabel("선택지 1", { exact: true }).fill("나무");
  await teacher.getByLabel("선택지 2", { exact: true }).fill("돌");
  await teacher
    .getByLabel("정답 근거·해설", { exact: true })
    .fill("씨앗은 물을 먹고 나무로 자랐습니다.");
  await teacher
    .getByRole("button", { name: "활동 양식 서버에 저장", exact: true })
    .click();
  const quizTemplate = teacher
    .locator("#maker .tool-card")
    .filter({ hasText: "CI 생각 다리 퀴즈" });
  await expect(quizTemplate).toHaveCount(1);
  await quizTemplate
    .getByRole("button", { name: "학급 배부 내용 확인", exact: true })
    .click();
  await expect(
    teacher.getByRole("button", {
      name: "확인하고 우리 반에 배부",
      exact: true,
    }),
  ).toBeDisabled();
  await teacher
    .getByRole("checkbox", {
      name: "문제·정답·해설의 근거와 학생에게 적절한 내용임을 직접 확인했습니다.",
      exact: true,
    })
    .check();
  await teacher
    .getByRole("button", { name: "확인하고 우리 반에 배부", exact: true })
    .click();
  await student.goto(path);
  const game = student.locator("#activities .tool-card").filter({
    has: student.getByRole("heading", {
      name: "CI 생각 다리 퀴즈",
      exact: true,
    }),
  });
  await game.getByRole("radio", { name: "나무", exact: true }).check();
  await game.getByRole("button", { name: "활동 제출", exact: true }).click();
  await expect(
    game.getByText("퀴즈 결과 1 / 1 · 점수는 교사 확인·보상과 별도입니다.", {
      exact: true,
    }),
  ).toBeVisible();
  await teacher.reload();
  await teacher
    .getByRole("textbox", { name: "CI 공방 학생에게 피드백", exact: true })
    .fill("정답의 근거를 확인했어요.");
  await teacher
    .getByRole("button", { name: "활동 확인·보상 반영", exact: true })
    .click();
  await expect(
    teacher
      .locator("#activities")
      .getByText("확인 완료 · 정답의 근거를 확인했어요.", { exact: true }),
  ).toBeVisible();
  await student.reload();
  await student
    .locator("#evidence")
    .getByRole("button", {
      name: "독서·글쓰기·수업 활동 근거 불러오기",
      exact: true,
    })
    .click();
  await expect(
    student
      .locator("#evidence")
      .getByText("CI 공방 활동 · 2번째 제출", { exact: true }),
  ).toBeVisible();
  const api = createClient(f.url, f.key, { auth: { persistSession: false } });
  const loginResult = await api.auth.signInWithPassword({
    email: f.workshop.student.loginId + "@students.bookforest.invalid",
    password: f.workshop.student.password,
  });
  expect(loginResult.error).toBeNull();
  const events = await api
    .from("activity_events")
    .select("kind,source_key")
    .eq("classroom_id", f.workshop.classroom);
  expect(events.error).toBeNull();
  expect(events.data?.filter((e) => e.kind === "mission")).toHaveLength(2);
  expect(events.data?.filter((e) => e.kind === "revision")).toHaveLength(1);
  await teacher.goto(
    "/reports?classroom=" +
      f.workshop.classroom +
      "&student=" +
      f.workshop.student.id,
  );
  await teacher
    .getByLabel("성장 보고서 제목", { exact: true })
    .fill("CI 공방 성장 기록");
  await teacher
    .getByRole("textbox", { name: "선생님의 관찰과 응원", exact: true })
    .fill("피드백을 읽고 근거를 더 구체적으로 고쳐 썼습니다.");
  await teacher
    .getByRole("checkbox", {
      name: "활동 수치·선택한 원문·관찰 의견과 공개 범위를 직접 확인했습니다",
      exact: true,
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
  const reviewName =
    "CI 공방 성장 기록 1판의 원문·수치·의견과 학생 공개 범위를 확인했습니다";
  await teacher
    .getByRole("checkbox", { name: reviewName, exact: true })
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
    .getByRole("checkbox", { name: reviewName, exact: true })
    .check();
  await teacher
    .getByRole("button", { name: "학생에게 공개", exact: true })
    .click();
  await expect(
    teacher.getByText("학생에게 공개했어요.", { exact: true }),
  ).toBeVisible();
  await teacher.goto(path);
  await teacher
    .getByRole("checkbox", {
      name: "해당 학생·보호자의 공유 의사와 보고서 내용을 확인했으며 선택한 보고서만 전달합니다.",
      exact: true,
    })
    .check();
  await teacher
    .getByRole("button", {
      name: "확인한 보고서 공유 링크 만들기",
      exact: true,
    })
    .click();
  const shareUrl = await teacher
    .getByLabel("이번 보호자 공유 링크", { exact: true })
    .inputValue();
  await parent.goto(shareUrl);
  await expect(
    parent.getByRole("heading", { name: "CI 공방 성장 기록", exact: true }),
  ).toBeVisible();
  await expect(
    parent.getByText("피드백을 읽고 근거를 더 구체적으로 고쳐 썼습니다.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(parent.url()).not.toContain("#");
  await teacher
    .getByRole("button", { name: "이 보호자 공유 즉시 해제", exact: true })
    .click();
  await expect(
    teacher.locator("#family").getByText(/공유 해제 · 만료/),
  ).toBeVisible();
  await parent
    .getByRole("button", { name: "공유 상태 다시 확인", exact: true })
    .click();
  await expect(
    parent.getByText(
      "공유 기간이 끝났거나 해제된 링크입니다. 담당 선생님에게 새 링크를 요청해 주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  for (const p of [teacher, student]) {
    await p.setViewportSize({ width: 390, height: 844 });
    expect(
      await p.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(391);
    const axe = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  checks.forEach((check) => check());
  await Promise.all([tc.close(), sc.close(), pc.close()]);
});
