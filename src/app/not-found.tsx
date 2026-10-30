import Link from "next/link";
import { Compass } from "lucide-react";
export default function NotFound() {
  return (
    <div className="empty-state standalone">
      <Compass size={44} />
      <h1>잠깐, 다른 숲길로 왔어요.</h1>
      <p>찾는 페이지가 없거나 주소가 바뀌었어요.</p>
      <Link className="button button-primary" href="/">
        책숲으로 돌아가기
      </Link>
    </div>
  );
}
