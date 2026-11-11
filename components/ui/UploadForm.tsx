"use client";
import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
export default function UploadForm({
  en,
  busy,
  properties,
  onSubmit,
}: {
  en: boolean;
  busy: boolean;
  properties: { id: string; title: string }[];
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const t = (zh: string, english: string) => (en ? english : zh);
  const valid =
    file &&
    file.size <= 10 * 1024 * 1024 &&
    ["image/jpeg", "image/png"].includes(file.type);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <form method="post" onSubmit={onSubmit} className="upload-form">
      <label>
        {t("选择房源", "Choose a property")}
        <select name="propertyId" required disabled={busy}>
          {properties.length ? (
            properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))
          ) : (
            <option value="">
              {t("暂无可用房源", "No property available")}
            </option>
          )}
        </select>
      </label>
      <label>
        {t("上传电费凭证", "Electricity statement")}
        <input
          name="file"
          type="file"
          accept="image/jpeg,image/png"
          required
          disabled={busy}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            setFile(next);
            setPreview(
              next &&
                next.size <= 10 * 1024 * 1024 &&
                ["image/jpeg", "image/png"].includes(next.type)
                ? URL.createObjectURL(next)
                : "",
            );
          }}
        />
        <small className="muted">
          JPG / PNG ·{" "}
          {t(
            "最大 10 MB，请保留完整账期与金额",
            "Up to 10 MB; include the full dates and amounts",
          )}
        </small>
      </label>
      {file && !valid && (
        <p role="alert" className="notice notice-warning">
          {t(
            "请选择不超过 10 MB 的 JPG 或 PNG 图片。",
            "Choose a JPG or PNG image up to 10 MB.",
          )}
        </p>
      )}
      {preview && (
        <div className="upload-preview">
          <Image
            src={preview}
            alt={t("待上传凭证预览", "Statement preview")}
            width={900}
            height={1200}
            unoptimized
            style={{
              width: "auto",
              height: "auto",
              maxHeight: 320,
              objectFit: "contain",
            }}
          />
          <p className="muted">{file?.name}</p>
        </div>
      )}
      <button disabled={busy || !properties.length || !valid}>
        {busy
          ? t("正在处理…", "Processing…")
          : t("上传并自动处理", "Upload and process")}
      </button>
    </form>
  );
}
