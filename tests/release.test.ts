import {it,expect,vi,afterEach} from "vitest";
import {releaseIdentity,appVersion} from "@/lib/release";
import pkg from "../package.json";
afterEach(()=>vi.unstubAllEnvs());
it("identifies a public build without exposing unrelated environment variables",()=>{vi.stubEnv("BOOKFOREST_BUILD_SHA","a".repeat(40));vi.stubEnv("BOOKFOREST_BUILD_DIRTY","false");vi.stubEnv("UNRELATED_SECRET","private-value");expect(releaseIdentity().commit).toBe("a".repeat(40));expect(JSON.stringify(releaseIdentity())).not.toContain("private-value");expect(appVersion).toBe(pkg.version);vi.stubEnv("BOOKFOREST_BUILD_SHA","unsafe commit");expect(releaseIdentity().commit).toBeNull();});
