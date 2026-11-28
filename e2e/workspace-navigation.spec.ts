import fs from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./checked-test";

const fixture = JSON.parse(fs.readFileSync("e2e/.runtime/fixtures.json", "utf8"));

async function enter(page: Page, id: string, password: string) {
  await page.getByLabel("학생 아이디 또는 선생님 이메일", { exact: true }).fill(id);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "내 교실로 들어가기", exact: true }).click();
}

test("initial password setup returns to the original mission", async ({ page, runtimeCheck }, info) => {
  const { classroom, assignment, firstLogins } = fixture.navigation;
  const student = firstLogins[info.project.name];
  const mission = "/app/work/" + assignment + "?classroom=" + classroom;
  runtimeCheck.phase("open-direct-mission");
  await page.goto(mission);
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(mission);
  runtimeCheck.phase("initial-login");
  await enter(page, student.loginId, student.password);
  await expect(page.getByRole("heading", { name: "비밀번호 바꾸기" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe(mission);
  await page.getByLabel("현재 비밀번호", { exact: true }).fill(student.password);
  await page.getByLabel("새 비밀번호", { exact: true }).fill(student.nextPassword);
  await page.getByLabel("새 비밀번호 확인", { exact: true }).fill(student.nextPassword);
  runtimeCheck.phase("change-password");
  await page.getByRole("button", { name: "비밀번호 변경", exact: true }).click();
  await expect(page.getByText("새 비밀번호로 다시 로그인해 주세요.", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe(mission);
  runtimeCheck.phase("login-and-open-mission");
  await enter(page, student.loginId, student.nextPassword);
  await expect(page).toHaveURL(mission);
  await expect(page.getByRole("link", { name: "오늘 할 일로 돌아가기" })).toHaveAttribute(
    "href", "/hub?tab=today&classroom=" + classroom,
  );
});

test("quick reading needs an explicit classroom and invalid search keeps it", async ({ page, runtimeCheck }) => {
  const { classroom, student } = fixture.workshop;
  runtimeCheck.phase("open-all-classrooms");
  await page.goto("/hub?tab=today&classroom=");
  await enter(page, student.loginId, student.password);
  const choice = page.getByRole("combobox", { name: "간편 독서 기록을 남길 학급", exact: true });
  await expect(choice).toHaveValue("");
  await expect(page.getByLabel("오늘의 간편 독서 기록", { exact: true })).toHaveCount(0);
  runtimeCheck.phase("choose-quick-reading-class");
  await choice.selectOption(classroom);
  await page.getByRole("button", { name: "이 학급의 독서 기록 열기", exact: true }).click();
  await expect(page.getByLabel("오늘의 간편 독서 기록", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("classroom")).toBe(classroom);
  runtimeCheck.phase("open-reading-editor");
  await page.getByRole("navigation", { name: "교실 바로가기" }).getByRole("link", { name: "나의 책장", exact: true }).click();
  const openEditor = page.getByRole("button", { name: "독서 기록 쓰기", exact: true });
  await expect(openEditor).toBeVisible();
  await page.getByRole("combobox", { name: "지금 보고 있는 학급", exact: true }).selectOption("");
  await expect(page.getByRole("combobox", { name: "간편 독서 기록을 남길 학급", exact: true })).toBeVisible();
  await openEditor.click();
  const bookClass = page.getByRole("combobox", { name: "독서 기록을 저장할 학급", exact: true });
  const title = page.getByLabel("책 제목", { exact: true });
  await expect(bookClass).toHaveValue("");
  await expect(title).toBeDisabled();
  await bookClass.selectOption(classroom);
  await expect(title).toBeEnabled();
  runtimeCheck.phase("open-invalid-search");
  await page.goto("/hub?tab=search&classroom=" + classroom + "&from=2026-11-30&to=2026-11-29");
  await expect(page.getByText(/검색 조건을 확인해 주세요/)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "지금 보고 있는 학급", exact: true })).toHaveValue(classroom);
});
