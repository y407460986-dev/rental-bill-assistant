import Image from "next/image";
import type { ReactNode } from "react";
export default function LoginPanel({
  en,
  children,
}: {
  en: boolean;
  children: ReactNode;
}) {
  const t = (zh: string, english: string) => (en ? english : zh);
  return (
    <section className="auth-layout" data-od-id="login">
      <div className="auth-visual">
        <Image
          src="/images/sunlit-home.jpg"
          alt={t(
            "日光下的居住空间，氛围示意",
            "A sunlit interior, illustrative photography",
          )}
          fill
          sizes="50vw"
        />
        <div>
          <h2>
            {t("把日子，住成喜欢的样子。", "Make room for a life you love.")}
          </h2>
          <p>
            {t(
              "居住氛围示意 · 非房源实拍",
              "Interior inspiration · illustrative photography",
            )}
          </p>
        </div>
      </div>
      <div className="auth-panel">
        <p className="eyebrow">{t("很高兴，又见到你", "WELCOME BACK")}</p>
        <h1>{t("欢迎回家。", "Welcome home.")}</h1>
        <p className="muted">
          {t(
            "登录已有账号，跟进找房申请、查看入住安排，或管理你的出租房源。",
            "Sign in to your existing account to follow applications, view your stay or manage your listings.",
          )}
        </p>
        {children}
        <p className="muted">
          {t(
            "请使用与你的房源或申请关联的账号。登录后可查看账号权限内的入住与账单。",
            "Use the account linked to your listings or applications to access your stays and bills.",
          )}
        </p>
      </div>
    </section>
  );
}
