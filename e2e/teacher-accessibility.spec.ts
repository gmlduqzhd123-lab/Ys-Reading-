import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import {watchBrowserErrors} from "./browser-errors";
const f=JSON.parse(fs.readFileSync("e2e/.runtime/fixtures.json","utf8"));
test.use({timezoneId:"America/Los_Angeles"});
test("teacher roster, invitations, term progression, batch export and simple student view are accessible",async({page,browser})=>{
  const check=watchBrowserErrors(page);
  await page.goto("/start?mode=new");
  await expect(page).toHaveURL(/\/login\?mode=teacher&intent=classroom/);
  const passwordLogin = page.locator(".login-password-option");
  await passwordLogin.locator("summary").click();
  await passwordLogin.getByLabel("선생님 이메일",{exact:true}).fill(f.accounts[1].email);
  await passwordLogin.getByLabel("비밀번호",{exact:true}).fill(f.accounts[1].password);
  await passwordLogin.getByRole("button",{name:"비밀번호로 로그인",exact:true}).click();
  await expect(page).toHaveURL(/\/start\?mode=new/);
  await expect(page.getByRole("navigation", { name: "주 메뉴", exact: true })
    .getByRole("link", { name: "오늘의 교실", exact: true })).toBeVisible();
  for(const route of ["/operations","/collaboration?classroom="+f.classroom,"/hub?tab=terms&classroom="+f.classroom,"/hub?tab=exports&classroom="+f.classroom,"/hub?tab=manage&classroom="+f.classroom]){
    await page.goto(route);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link",{name:"본문으로 바로가기",exact:true})).toBeFocused();
    await page.locator("main details").evaluateAll(list=>list.forEach(node=>{(node as HTMLDetailsElement).open=true;}));
    const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
    expect(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),route).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1281);
  }
  const other=await page.context().newPage(),otherCheck=watchBrowserErrors(other);
  await other.goto(page.url());
  await expect(other.getByText("교사 입력은 본인만 볼 수 있도록 7일간 임시 보관합니다.",{exact:true})).toBeVisible();
  await page.getByRole("checkbox",{name:"학생 메뉴 간편 보기",exact:true}).check();
  await page.getByLabel("새 독서 기록의 작성 도움",{exact:true}).selectOption("guided");
  await expect(page.getByText("교사 작성 내용을 임시 보관했어요. 최종 저장·피드백 전송은 별도로 확인해 주세요.",{exact:true})).toBeVisible();
  await other.getByRole("checkbox",{name:"학생 메뉴 간편 보기",exact:true}).check();
  await other.getByLabel("새 독서 기록의 작성 도움",{exact:true}).selectOption("free");
  await expect(other.getByRole("alert").filter({hasText:"다른 화면에서 교사 초안이 바뀌었어요"})).toBeVisible();
  await other.getByRole("button",{name:"현재 입력으로 다시 저장",exact:true}).click();
  await expect(other.getByText("교사 작성 내용을 임시 보관했어요. 최종 저장·피드백 전송은 별도로 확인해 주세요.",{exact:true})).toBeVisible();
  otherCheck();await other.close();
  await page.reload();
  await page.getByRole("button",{name:"교사 초안 불러오기",exact:true}).click();
  await expect(page.getByLabel("새 독서 기록의 작성 도움",{exact:true})).toHaveValue("free");
  await page.getByLabel("새 독서 기록의 작성 도움",{exact:true}).selectOption("guided");
  await expect(page.getByText("교사 작성 내용을 임시 보관했어요. 최종 저장·피드백 전송은 별도로 확인해 주세요.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"이 학급 학생 화면 설정 저장",exact:true}).click();
  await expect(page.getByText("학생 화면 시작 설정을 저장했어요.",{exact:true})).toBeVisible();
  const c=await browser.newContext(),student=await c.newPage(),studentCheck=watchBrowserErrors(student);
  await student.goto("/login");
  await student.getByLabel("학생 아이디 또는 선생님 이메일",{exact:true}).fill(f.mobile.loginId);
  await student.getByLabel("비밀번호",{exact:true}).fill(f.mobile.password);
  await student.getByRole("button",{name:"내 교실로 들어가기",exact:true}).click();
  await expect(student).toHaveURL(/\/hub/);
  await student.goto("/hub?tab=today&classroom="+f.classroom);
  const more=student.locator("summary").filter({hasText:"더 많은 활동 보기"});
  await expect(more).toBeVisible();await more.focus();await student.keyboard.press("Enter");
  await expect(student.getByRole("navigation",{name:"추가 책숲 활동"})).toBeVisible();
  await student.goto("/hub?tab=reading&classroom="+f.classroom+"#reading-editor");
  await expect(student.getByLabel("작성 방법 선택",{exact:true})).toHaveValue("guided");
  await expect(student.getByRole("link", { name: "학급 개설", exact: true })).toHaveCount(0);
  await student.goto("/start?mode=new");
  await expect(student).toHaveURL(/\/hub\?tab=today/);

  await page.goto("/hub?tab=today");
  await page.evaluate(({ user, classroom }) => {
    sessionStorage.setItem("bookforest-start:" + user, JSON.stringify({
      version: 1, user, classroom, step: 2, savedAt: Date.now(),
    }));
  }, { user: f.accounts[1].id, classroom: f.classroom });
  await page.getByRole("link", { name: "학급 개설", exact: true }).click();
  await expect(page.getByLabel("새 학급 이름", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "기존 학급 준비 이어가기", exact: true }).click();
  await expect(page.getByRole("heading", { name: /학생 별칭으로 계정/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "주 메뉴", exact: true });
  await nav.getByText("더보기", { exact: true }).click();
  await nav.getByRole("link", { name: "학급 개설 (교사)", exact: true }).click();
  const name = "CI 학급 개설 바로가기";
  await page.getByLabel("새 학급 이름", { exact: true }).fill(name);
  await page.getByRole("button", { name: "학급 개설", exact: true }).click();
  await expect(page.getByRole("heading", { name: /학생 별칭으로 계정/ })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "학급 준비 현황" }).getByText("0명", { exact: true })).toBeVisible();
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: /학생 별칭으로 계정/ })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  check();studentCheck();await c.close();
});
