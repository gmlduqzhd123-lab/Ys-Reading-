import {it,expect,vi,beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({profile:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProfile:mocks.profile}));vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:mocks.rpc})}));
import {readingDraftAction} from "@/app/hub/reading-draft-actions";
const actor="10000000-0000-4000-8000-000000000001",classroom="20000000-0000-4000-8000-000000000001";
beforeEach(()=>{vi.clearAllMocks();mocks.profile.mockResolvedValue({id:actor,role:"student",consent_status:"verified"});mocks.rpc.mockResolvedValue({data:{draft:null},error:null});});
it("rejects an old tab after its login account changes before any draft write",async()=>{await expect(readingDraftAction({owner:"10000000-0000-4000-8000-000000000002",action:"load",classroom,record:null})).rejects.toThrow("BF_ACCOUNT_CHANGED");expect(mocks.rpc).not.toHaveBeenCalled();});
it("uses the authenticated actor and server-scoped RPC for the matching tab",async()=>{expect(await readingDraftAction({owner:actor,action:"load",classroom,record:null})).toEqual({draft:null});expect(mocks.rpc).toHaveBeenCalledWith("reading_draft",expect.objectContaining({p_classroom:classroom,p_action:"load"}));});
