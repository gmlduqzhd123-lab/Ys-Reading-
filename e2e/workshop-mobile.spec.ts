import {
  test,
  expect,
  type Page,
  type BrowserContextOptions,
} from "@playwright/test";
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
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
function isbn(n: number) {
  const s = "978" + String(n).padStart(9, "0"),
    sum = [...s].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
  return s + ((10 - (sum % 10)) % 10);
}
test("mobile workshop restores drafts, reviews and exports selected evidence, and revokes family access", async ({
  browser,
}, info) => {
  test.setTimeout(240000);
  const use = info.project.use,
    options: BrowserContextOptions = {
      baseURL: "http://127.0.0.1:3096",
      viewport: use.viewport,
      isMobile: use.isMobile,
      hasTouch: use.hasTouch,
      userAgent: use.userAgent,
      deviceScaleFactor: use.deviceScaleFactor,
    };
  const tc = await browser.newContext(options),
    sc = await browser.newContext(options),
    pc = await browser.newContext(options),
    teacher = await tc.newPage(),
    student = await sc.newPage(),
    parent = await pc.newPage();
  const errors = [teacher, student, parent].map(watchBrowserErrors),
    cls = f.workshopTouch[info.project.name],
    path = (section: string) =>
      "/classroom?classroom=" + cls + "&section=" + section;
  if (!cls) throw Error("ISOLATED_TOUCH_CLASS_REQUIRED");
  for (const p of [teacher, student]) p.on("dialog", (d) => d.accept());
  await login(teacher, f.accounts[1].email, f.accounts[1].password);
  await teacher.goto(path("maker"));
  const title = "CI 모바일 회복 활동";
  await teacher.getByLabel("활동 제목", { exact: true }).fill(title);
  await expect(
    teacher
      .locator("#maker")
      .getByRole("status")
      .filter({ hasText: /수업 작성 내용을 임시 보관했어요/ }),
  ).toBeVisible();
  await teacher.reload();
  await teacher
    .getByRole("button", { name: "수업 초안 불러오기", exact: true })
    .click();
  await expect(teacher.getByLabel("활동 제목", { exact: true })).toHaveValue(
    title,
  );
  await teacher
    .getByRole("button", { name: "활동 양식 서버에 저장", exact: true })
    .click();
  const template = teacher
    .locator("#maker .tool-card")
    .filter({ hasText: title });
  await expect(template).toHaveCount(1);
  await template
    .getByRole("button", { name: "학급 배부 내용 확인", exact: true })
    .click();
  await teacher
    .getByRole("button", { name: "확인하고 우리 반에 배부", exact: true })
    .click();
  await teacher.getByRole("link", { name: "활동 확인", exact: true }).click();
  await expect(teacher).toHaveURL(/section=activities/);
  await login(student, f.workshop.student.loginId, f.workshop.student.password);
  await student.goto(path("today"));
  const quick = student.getByLabel("오늘의 간편 독서 기록", { exact: true });
  await quick
    .getByLabel("오늘 읽은 책 제목", { exact: true })
    .fill("CI 모바일 한 줄 책");
  await quick
    .getByRole("button", { name: "이 책으로 오늘 기록하기", exact: true })
    .click();
  await quick
    .getByLabel("오늘의 한 줄 생각", { exact: true })
    .fill("한글로 입력한 나의 생각을 다시 이어 쓰고 싶어요.");
  await expect(
    quick
      .getByRole("status")
      .filter({ hasText: /수업 작성 내용을 임시 보관했어요/ }),
  ).toBeVisible();
  await student.reload();
  await quick
    .getByRole("button", { name: "수업 초안 불러오기", exact: true })
    .click();
  await expect(
    quick.getByLabel("오늘의 한 줄 생각", { exact: true }),
  ).toHaveValue("한글로 입력한 나의 생각을 다시 이어 쓰고 싶어요.");
  await quick
    .getByRole("button", { name: "오늘 독서 기록 저장", exact: true })
    .click();
  await expect(quick.getByText(/독서 기록을 저장했어요/)).toBeVisible();
  await student
    .getByRole("link", { name: "우리 반 활동", exact: true })
    .click();
  const activity = student.locator("#activities .tool-card").filter({
    has: student.getByRole("heading", { name: title, exact: true }),
  });
  await expect(activity.locator("textarea")).toHaveCount(3);
  await expect(activity.locator("textarea").first()).toBeEnabled();
  await sc.setOffline(true);
  for (const area of await activity.locator("textarea").all())
    await area.fill("물 주는 장면을 근거로 꾸준한 돌봄을 생각했어요.");
  await expect(activity.getByText(/연결이 끊겼어요/)).toBeVisible();
  await sc.setOffline(false);
  await expect(
    activity
      .getByRole("status")
      .filter({ hasText: /수업 작성 내용을 임시 보관했어요/ }),
  ).toBeVisible();
  await student.reload();
  await activity
    .getByRole("button", { name: "수업 초안 불러오기", exact: true })
    .click();
  await expect(activity.locator("textarea").first()).toHaveValue(
    "물 주는 장면을 근거로 꾸준한 돌봄을 생각했어요.",
  );
  await activity
    .getByRole("button", { name: "활동 제출", exact: true })
    .click();
  await expect(
    activity.getByText("나의 1번째 제출 · 선생님 확인 대기", { exact: true }),
  ).toBeVisible();
  await teacher.reload();
  const feedback = teacher.getByRole("textbox", {
    name: "CI 공방 학생에게 피드백",
    exact: true,
  });
  await feedback.fill("장면과 나의 생각을 구체적으로 연결했어요.");
  const review = teacher.locator("form").filter({ has: feedback });
  await expect(
    review
      .getByRole("status")
      .filter({ hasText: /수업 작성 내용을 임시 보관했어요/ }),
  ).toBeVisible();
  await teacher.reload();
  await teacher
    .getByRole("button", { name: "수업 초안 불러오기", exact: true })
    .click();
  await expect(feedback).toHaveValue(
    "장면과 나의 생각을 구체적으로 연결했어요.",
  );
  await teacher
    .getByRole("button", { name: "활동 확인·보상 반영", exact: true })
    .click();
  await expect(
    teacher.getByText("확인 완료 · 장면과 나의 생각을 구체적으로 연결했어요.", {
      exact: true,
    }),
  ).toBeVisible();
  const assigned = teacher.locator("#activities > .tool-card").filter({
    has: teacher.getByRole("heading", { name: title, exact: true }),
  });
  await assigned.getByText("마감 연장·다시 열기", { exact: true }).click();
  await assigned
    .getByRole("checkbox", {
      name: "학생 제출을 받을 수 있도록 열기",
      exact: true,
    })
    .uncheck();
  await assigned
    .getByRole("checkbox", {
      name: "제출 가능 기간과 진행 상태 변경을 확인했습니다.",
      exact: true,
    })
    .check();
  await assigned
    .getByRole("button", { name: "활동 기간·상태 저장", exact: true })
    .click();
  await expect(assigned.getByText(/배부 버전 1 · 종료/)).toBeVisible();
  await assigned
    .getByRole("checkbox", {
      name: "학생 제출을 받을 수 있도록 열기",
      exact: true,
    })
    .check();
  await assigned
    .getByRole("checkbox", {
      name: "제출 가능 기간과 진행 상태 변경을 확인했습니다.",
      exact: true,
    })
    .check();
  await assigned
    .getByRole("button", { name: "활동 기간·상태 저장", exact: true })
    .click();
  await expect(assigned.getByText(/배부 버전 1 · 진행/)).toBeVisible();
  await teacher.getByRole("link", { name: "교실 도서", exact: true }).click();
  await teacher
    .getByText("교실·학교 보유 도서 CSV 등록", { exact: true })
    .click();
  const sample = teacher.waitForEvent("download");
  await teacher
    .getByRole("button", { name: "보유 도서 CSV 예제 받기", exact: true })
    .click();
  expect(fs.readFileSync((await (await sample).path())!, "utf8")).toContain(
    "ISBN,제목,저자,위치,권수",
  );
  const file = teacher.getByLabel("보유 도서 CSV 파일", { exact: true });
  await file.setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "ISBN,제목,저자,위치,권수\n9788936434120,잘못된 권수,교사,책장,0",
    ),
  });
  await expect(teacher.getByRole("alert")).toContainText("2번째 줄");
  const csv =
    "ISBN,제목,저자,위치,권수\n" +
    Array.from({ length: 100 }, (_, i) =>
      [isbn(i), "CI 모바일 도서 " + i, "책숲", "책장 " + i, 1].join(","),
    ).join("\n");
  await file.setInputFiles({
    name: "library.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    teacher
      .getByRole("region", { name: "CSV 등록 전 전체 도서 목록", exact: true })
      .locator("tbody tr"),
  ).toHaveCount(100);
  await teacher
    .getByRole("button", { name: "확인한 도서 목록 등록", exact: true })
    .click();
  await expect(
    teacher.getByText("검색 결과 100권", { exact: true }),
  ).toBeVisible();
  await teacher
    .getByLabel("보유 도서 검색어", { exact: true })
    .fill("CI 모바일 도서 99");
  await teacher
    .getByRole("button", { name: "보유 도서 검색", exact: true })
    .click();
  const book = teacher.locator("#library .tool-card").filter({
    has: teacher.getByRole("heading", {
      name: "CI 모바일 도서 99",
      exact: true,
    }),
  });
  await book.getByText("이 도서 수정·삭제", { exact: true }).click();
  await book.getByLabel("도서 위치 수정", { exact: true }).fill("새 책장");
  await book
    .getByRole("button", { name: "도서 수정 저장", exact: true })
    .click();
  await expect(book.getByText(/새 책장 · 보유 1권/)).toBeVisible();
  await book.getByText("이 도서 수정·삭제", { exact: true }).click();
  await book.getByRole("checkbox").check();
  await book
    .getByRole("button", { name: "확인한 보유 도서 삭제", exact: true })
    .click();
  await expect(
    teacher.getByRole("heading", { name: "CI 모바일 도서 99", exact: true }),
  ).toHaveCount(0);
  await teacher.getByRole("link", { name: "성장 근거", exact: true }).click();
  await teacher
    .getByRole("button", {
      name: "독서·글쓰기·수업 활동 근거 불러오기",
      exact: true,
    })
    .click();
  await expect(
    teacher.getByText(title + " · 1번째 제출", { exact: true }),
  ).toBeVisible();
  await teacher
    .getByRole("link", { name: "이 학생의 성장 보고서 준비", exact: true })
    .click();
  const reportTitle = "CI 모바일 성장 기록";
  await teacher
    .getByLabel("성장 보고서 제목", { exact: true })
    .fill(reportTitle);
  await teacher
    .getByRole("textbox", { name: "선생님의 관찰과 응원", exact: true })
    .fill("모바일에서도 기록을 복구하고 근거를 남겼습니다.");
  await teacher
    .getByRole("checkbox", { name: title + " · 1번째 활동", exact: true })
    .check();
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
  const downloaded = teacher.waitForEvent("download");
  await teacher.getByRole("button", { name: "CSV 저장", exact: true }).click();
  expect(fs.readFileSync((await (await downloaded).path())!, "utf8")).toContain(
    "꾸준한 돌봄",
  );
  const confirm =
    reportTitle + " 1판의 원문·수치·의견과 학생 공개 범위를 확인했습니다";
  await teacher.getByRole("checkbox", { name: confirm, exact: true }).check();
  await teacher
    .getByRole("button", { name: "이 판 검토 완료", exact: true })
    .click();
  await expect(
    teacher.getByText(
      "검토를 완료했어요. 공개 범위를 확인한 뒤 학생에게 공개하세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await teacher.getByRole("checkbox", { name: confirm, exact: true }).check();
  await teacher
    .getByRole("button", { name: "학생에게 공개", exact: true })
    .click();
  await expect(
    teacher.getByText("학생에게 공개했어요.", { exact: true }),
  ).toBeVisible();
  await teacher.goto(path("family"));
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
  const url = await teacher
    .getByLabel("이번 보호자 공유 링크", { exact: true })
    .inputValue();
  await parent.goto(url);
  await expect(
    parent.getByRole("heading", { name: reportTitle, exact: true }),
  ).toBeVisible();
  await expect(parent.getByText(/물 주는 장면을 근거로/)).toBeVisible();
  expect(parent.url()).not.toContain("#");
  await teacher
    .getByText("학생의 유효한 링크 모두 해제", { exact: true })
    .click();
  await teacher
    .getByLabel("공유를 모두 해제할 학생", { exact: true })
    .selectOption(f.workshop.student.id);
  await teacher
    .getByRole("checkbox", {
      name: "선택한 학생의 이 학급 유효 공유 링크를 모두 해제합니다.",
      exact: true,
    })
    .check();
  await teacher
    .getByRole("button", { name: "확인한 학생의 공유 모두 해제", exact: true })
    .click();
  await expect(
    teacher.getByText("1개의 유효한 공유 링크를 해제했어요.", { exact: true }),
  ).toBeVisible();
  await parent
    .getByRole("button", { name: "공유 상태 다시 확인", exact: true })
    .click();
  await expect(
    parent.getByText(/공유 기간이 끝났거나 해제된 링크/),
  ).toBeVisible();
  await student.goto(path("discoveries"));
  for (const p of [teacher, student, parent]) {
    expect(
      await p.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual((p.viewportSize()?.width ?? 0) + 1);
    expect(
      (
        await new AxeBuilder({ page: p })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  errors.forEach((check) => check());
  await Promise.all([tc.close(), sc.close(), pc.close()]);
});
