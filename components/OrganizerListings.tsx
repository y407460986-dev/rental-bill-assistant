"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { featureKeys, featureLabels, policyText } from "@/lib/rental/contracts";
import { RentalFrame, RentalError } from "./ui/RentalFrame";
import { useRemote, rentalRequest } from "./ui/useRemote";
import { useLanguage } from "./ui/useLanguage";
import { MoneyDecimal } from "@/lib/utils/decimal";
interface Property {
  id: string;
  title: string;
  city: string | null;
  neighborhood: string | null;
  address: string;
  description: string | null;
  furnished: boolean;
  advertisedRent: string | null;
  roomCount: number;
  sizeM2: number | null;
  availableFrom: string | null;
  isPublished: boolean;
  isDemo: boolean;
  features: string[];
  imageKey: string | null;
  editBlockReason:
    null | "LISTING_PUBLISHED" | "LISTING_IN_USE" | "LEGACY_LISTING_READ_ONLY";
  rentalMode: string;
  rooms: { id: string; name: string; capacity: number }[];
  _count: { applications: number; tenancies: number };
}
interface RoomDraft {
  key: number;
  name: string;
  capacity: string;
}
export default function OrganizerListings() {
  const { en, t } = useLanguage();
  const remote = useRemote<Property[]>("/api/organizer/listings");
  const who = useRemote<{ role: string }>("/api/auth/me");
  const [filter, setFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const editor = useRef<HTMLDetailsElement>(null);
  const [editing, setEditing] = useState<Property | null>(null);
  const [formRevision, setFormRevision] = useState(0);
  const [roomDrafts, setRoomDrafts] = useState<RoomDraft[]>([
    { key: 0, name: "", capacity: "1" },
  ]);
  const nextRoomKey = useRef(1);
  const landlord = who.data?.role === "LANDLORD";
  const loading = remote.loading || who.loading;
  const ready = landlord && !loading && !remote.error && !who.error;
  const listings = (remote.data ?? []).filter((item) => !item.isDemo);
  const listingStatus = (item: Property) =>
    !item.city ? "legacy" : item.isPublished ? "published" : "draft";
  const visibleListings = listings.filter(
    (item) => filter === "all" || listingStatus(item) === filter,
  );
  async function reload() {
    if (running.current) return;
    setError("");
    await Promise.all([who.reload(), remote.reload()]);
  }
  function resetEditor(item: Property | null) {
    setEditing(item);
    setFormRevision((revision) => revision + 1);
    setMode(item?.rentalMode ?? "WHOLE");
    setRoomDrafts(
      item?.rooms.length
        ? item.rooms.map((room) => ({
            key: nextRoomKey.current++,
            name: room.name,
            capacity: String(room.capacity),
          }))
        : [{ key: nextRoomKey.current++, name: "", capacity: "1" }],
    );
    setError("");
    setMessage("");
  }
  function openEditor(item: Property | null = null) {
    if (running.current || !ready || (item && item.editBlockReason !== null))
      return;
    resetEditor(item);
    setEditorOpen(true);
  }
  function cancelEditor() {
    if (running.current) return;
    resetEditor(null);
    setEditorOpen(false);
  }
  useEffect(() => {
    if (!editorOpen) return;
    editor.current?.scrollIntoView({ behavior: "instant", block: "start" });
    editor.current
      ?.querySelector<HTMLInputElement>("input[name=title]")
      ?.focus();
  }, [editorOpen, formRevision]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState("WHOLE"),
    [message, setMessage] = useState<
      "" | "draft" | "updated" | "published" | "unpublished"
    >("");
  const running = useRef(false);
  const notices = {
    draft: t(
      "草稿已保存。核对信息与费用约定后，在列表中发布。",
      "Draft saved. Review the details and terms, then publish below.",
    ),
    updated: t(
      "修改已保存，房源仍为草稿。核对后可单独发布。",
      "Changes saved. Your listing is still a draft; publish it separately after review.",
    ),
    published: t(
      "房源已发布，租客可以在找房页查看并申请。",
      "Published. Tenants can find and apply for this home.",
    ),
    unpublished: t(
      "房源已下架，已有申请与入住记录保留。",
      "Unpublished. Existing applications and stays are preserved.",
    ),
  };
  const editBlockMessages = {
    LISTING_PUBLISHED: t(
      "已发布的房源不能直接编辑。请先下架；没有申请、入住或账单等关联记录时才可编辑。",
      "Published listings cannot be edited. Unpublish first; editing is available only without linked applications, stays, bills or other protected records.",
    ),
    LISTING_IN_USE: t(
      "此房源已有关联申请、入住、账单或受保护的费用约定，不能编辑，以保留历史记录。",
      "This listing has linked applications, stays, bills or protected utility terms and cannot be edited, preserving its history.",
    ),
    LEGACY_LISTING_READ_ONLY: t(
      "历史房源仅供查看，不能在此编辑；原有入住与账单记录保持不变。",
      "Legacy properties are read-only here. Existing stays and billing records remain unchanged.",
    ),
  };
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (running.current || !ready) return;
    const form = e.currentTarget;
    const values = new FormData(form);
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const capacities = values.getAll("roomCapacity");
      const rooms =
        mode === "ROOMS"
          ? values.getAll("roomName").map((name, index) => ({
              name: String(name).trim(),
              capacity: Number(capacities[index]),
            }))
          : [];
      await rentalRequest(
        editing
          ? "/api/organizer/listings/" + editing.id
          : "/api/organizer/listings",
        {
          title: values.get("title"),
          city: values.get("city"),
          neighborhood: values.get("neighborhood"),
          address: values.get("address"),
          description: values.get("description"),
          rentalMode: mode,
          rent: new MoneyDecimal(String(values.get("rent"))).toFixed(2),
          roomCount: Number(values.get("roomCount") || 1),
          sizeM2: Number(values.get("sizeM2")),
          furnished: values.get("furnished") === "on",
          availableFrom: values.get("availableFrom"),
          imageKey: values.get("imageKey"),
          isDemo: editing?.isDemo ?? false,
          features: values.getAll("features"),
          rooms,
        },
        editing ? "PATCH" : "POST",
      );
      const savedEdit = editing !== null;
      resetEditor(null);
      setFilter("draft");
      setEditorOpen(false);
      setMessage(savedEdit ? "updated" : "draft");
      await remote.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function publish(id: string, published: boolean) {
    if (running.current || !ready) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rentalRequest("/api/organizer/listings/" + id, {
        published,
        consent: true,
      });
      setMessage(published ? "published" : "unpublished");
      await remote.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <RentalFrame active="listings">
      <header className="management-heading">
        <div>
          <p className="eyebrow">{t("房东工作台", "LANDLORD WORKSPACE")}</p>
          <h1>{t("管理房源", "Your listings")}</h1>
          <p className="muted">
            {t(
              "发布好住处，管理申请与入住。",
              "A home for your listings, applications and stays.",
            )}
          </p>
        </div>
        {landlord && !who.loading && (
          <div className="management-actions">
            <Link className="btn btn-secondary" href="/rental/applications">
              {t("查看申请", "Review applications")}
            </Link>
            <button
              className="btn btn-primary"
              disabled={!ready || busy}
              onClick={() => openEditor()}
            >
              {t("添加房源", "Add a listing")}
            </button>
          </div>
        )}
      </header>
      <RentalError error={who.error || remote.error || error} retry={reload} />
      {message && (
        <p role="status" className="notice">
          {notices[message]}
        </p>
      )}
      {loading && (
        <p role="status" className="management-loading">
          {t("正在读取账号与房源…", "Loading your account and listings…")}
        </p>
      )}
      {!who.loading && who.data && !landlord && (
        <div className="empty-state">
          <h2>
            {t("房源管理仅供房东使用", "Listing management is for landlords")}
          </h2>
          <Link className="btn btn-primary" href="/search">
            {t("寻找住处", "Find a home")}
          </Link>
        </div>
      )}
      {ready && (
        <div
          className="management-filters"
          role="group"
          aria-label={t("按房源状态筛选", "Filter listings by status")}
        >
          {[
            ["all", t("全部房源", "All listings")],
            ["published", t("已发布", "Published")],
            ["draft", t("草稿 / 已下架", "Draft / unpublished")],
            ["legacy", t("历史房源", "Legacy")],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}{" "}
              <span>
                {value === "all"
                  ? listings.length
                  : listings.filter((item) => listingStatus(item) === value)
                      .length}
              </span>
            </button>
          ))}
          <button
            className="management-refresh"
            disabled={busy}
            onClick={reload}
          >
            {t("刷新", "Refresh")}
          </button>
        </div>
      )}
      <details
        ref={editor}
        className="management-editor"
        hidden={!landlord}
        open={editorOpen}
        onToggle={(e) => setEditorOpen(e.currentTarget.open)}
      >
        <summary>
          {editing
            ? t("编辑房源草稿", "Edit listing draft")
            : t("创建新房源", "Create a new listing")}
        </summary>
        <h2>
          {editing
            ? t(`编辑：${editing.title}`, `Editing: ${editing.title}`)
            : t("创建新房源", "Create a new listing")}
        </h2>
        <p className="muted">
          {editing
            ? t(
                "修改将保存到当前房源，房源仍为草稿，不会自动发布。",
                "Save changes to this listing. It will remain a draft and will not be published automatically.",
              )
            : t(
                "先保存草稿，再确认费用约定并发布。除配套设施外，以下信息均需填写。",
                "Save a draft first, then confirm the utility terms to publish. Complete each section; features are optional.",
              )}
        </p>
        <form
          key={formRevision}
          className="listing-editor management-form"
          onSubmit={save}
        >
          <fieldset disabled={busy || !ready}>
            <legend>{t("基本信息", "The basics")}</legend>
            <label>
              {t("房源标题", "Listing title")}
              <input
                name="title"
                defaultValue={editing?.title ?? ""}
                required
                minLength={3}
                maxLength={120}
              />
            </label>
            <label>
              {t("房源描述", "Description")}
              <textarea
                name="description"
                defaultValue={editing?.description ?? ""}
                required
                minLength={20}
                maxLength={2000}
                rows={4}
              />
            </label>
          </fieldset>
          <fieldset disabled={busy || !ready}>
            <legend>{t("位置", "Location")}</legend>
            <div className="management-form-grid">
              <label>
                {t(
                  "城市（建议填写英文标准名）",
                  "City (canonical English name recommended)",
                )}
                <input
                  name="city"
                  defaultValue={editing?.city ?? ""}
                  placeholder="Berlin"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <label>
                {t("街区", "Neighbourhood")}
                <input
                  name="neighborhood"
                  defaultValue={editing?.neighborhood ?? ""}
                  required
                  maxLength={120}
                />
              </label>
            </div>
            <label>
              {t("详细地址", "Full address")}
              <input
                name="address"
                defaultValue={editing?.address ?? ""}
                required
                minLength={5}
                maxLength={240}
                aria-describedby="management-address-help"
              />
            </label>
            <small id="management-address-help" className="muted">
              {t(
                "详细地址仅在房东工作台显示，不在公开房源展示。",
                "The full address stays in your landlord workspace, not on the public listing.",
              )}
            </small>
          </fieldset>
          <fieldset disabled={busy || !ready}>
            <legend>{t("出租方式与房间", "Rental setup & rooms")}</legend>
            <div className="management-form-grid">
              <label>
                {t("出租方式", "Rental mode")}
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="WHOLE">{t("整套出租", "Entire home")}</option>
                  <option value="ROOMS">{t("按房间出租", "By room")}</option>
                </select>
              </label>
              <label>
                {t("整套房间数", "Rooms in the whole home")}
                <input
                  name="roomCount"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={editing?.roomCount ?? 1}
                  required
                />
              </label>
              <label>
                {t("整套面积（m²）", "Whole-home size (m²)")}
                <input
                  name="sizeM2"
                  defaultValue={editing?.sizeM2 ?? ""}
                  type="number"
                  required
                  min={1}
                  max={10000}
                />
              </label>
            </div>
            {mode === "ROOMS" && (
              <div className="management-room-editor">
                <p className="field-hint" id="management-rooms-help">
                  {t(
                    "为每间出租房间填写名称和人数。所有房间使用相同展示月租，面积为整套面积。",
                    "Name each rental room and its capacity. All rooms share the advertised rent; the area is for the whole home.",
                  )}
                </p>
                {roomDrafts.map((room, index) => (
                  <div className="management-room-row" key={room.key}>
                    <label>
                      {t(`房间 ${index + 1} 名称`, `Room ${index + 1} name`)}
                      <input
                        name="roomName"
                        value={room.name}
                        onChange={(e) =>
                          setRoomDrafts((rooms) =>
                            rooms.map((value) =>
                              value.key === room.key
                                ? { ...value, name: e.target.value }
                                : value,
                            ),
                          )
                        }
                        required
                        maxLength={60}
                        placeholder={t("如：向阳卧室", "e.g. Sunny bedroom")}
                        aria-describedby="management-rooms-help"
                      />
                    </label>
                    <label>
                      {t("最多入住人数", "Guest capacity")}
                      <input
                        name="roomCapacity"
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        value={room.capacity}
                        onChange={(e) =>
                          setRoomDrafts((rooms) =>
                            rooms.map((value) =>
                              value.key === room.key
                                ? { ...value, capacity: e.target.value }
                                : value,
                            ),
                          )
                        }
                        required
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={roomDrafts.length === 1}
                      onClick={() =>
                        setRoomDrafts((rooms) =>
                          rooms.filter((value) => value.key !== room.key),
                        )
                      }
                      aria-label={t(
                        `移除房间 ${index + 1}`,
                        `Remove room ${index + 1}`,
                      )}
                    >
                      {t("移除", "Remove")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={roomDrafts.length >= 20}
                  onClick={() => {
                    const key = nextRoomKey.current++;
                    setRoomDrafts((rooms) => [
                      ...rooms,
                      { key, name: "", capacity: "1" },
                    ]);
                  }}
                >
                  {t("添加一个房间", "Add a room")}
                </button>
              </div>
            )}
          </fieldset>
          <fieldset disabled={busy || !ready}>
            <legend>
              {t("租金、日期与费用约定", "Price, availability & terms")}
            </legend>
            <div className="management-form-grid">
              <label>
                {mode === "ROOMS"
                  ? t(
                      "每间月租（EUR，统一价）",
                      "Monthly rent per room (EUR, same price)",
                    )
                  : t("整套月租（EUR）", "Monthly whole-home rent (EUR)")}
                <input
                  name="rent"
                  defaultValue={editing?.advertisedRent ?? ""}
                  type="number"
                  min="0.01"
                  max="999999.99"
                  step="0.01"
                  placeholder="850"
                  required
                  inputMode="decimal"
                  aria-describedby="management-rent-help"
                />
              </label>
              <label>
                {t("可入住日期", "Available from")}
                <input
                  name="availableFrom"
                  type="date"
                  defaultValue={editing?.availableFrom?.slice(0, 10) ?? ""}
                  required
                />
              </label>
            </div>
            <small id="management-rent-help" className="muted">
              {t(
                "支持最多两位小数。租金仅供展示，平台暂不收取租金。",
                "Up to two decimal places. Rent is advertised only, not collected here.",
              )}
            </small>
            <div className="management-terms">
              <strong>
                {t(
                  "发布时需确认的电费约定",
                  "Electricity terms to confirm when publishing",
                )}
              </strong>
              <p>{en ? policyText.en : policyText.zh}</p>
            </div>
          </fieldset>
          <fieldset disabled={busy || !ready}>
            <legend>{t("配套与偏好", "Features & preferences")}</legend>
            <label className="management-check">
              <input
                type="checkbox"
                name="furnished"
                defaultChecked={editing?.furnished ?? false}
              />
              {t("带家具", "Furnished")}
            </label>
            <div className="management-feature-options">
              {featureKeys.map((key) => (
                <label className="management-check" key={key}>
                  <input
                    type="checkbox"
                    name="features"
                    value={key}
                    defaultChecked={editing?.features.includes(key) ?? false}
                  />
                  {featureLabels[key][en ? 1 : 0]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy || !ready}>
            <legend>{t("房源配图", "Listing imagery")}</legend>
            <label>
              {t("选择示意图片", "Choose an illustrative image")}
              <select
                name="imageKey"
                defaultValue={editing?.imageKey ?? "living-room"}
              >
                <option value="living-room">
                  {t("温暖客厅", "Warm living room")}
                </option>
                <option value="sunlit-home">
                  {t("日光空间", "Sunlit home")}
                </option>
                <option value="quiet-bedroom">
                  {t("安静卧室", "Quiet bedroom")}
                </option>
                <option value="shared-space">
                  {t("共享空间", "Shared space")}
                </option>
              </select>
            </label>
            <p className="muted">
              {t(
                "这些是示意图片，不是房源实拍。当前不支持上传照片。",
                "These are illustrative images, not photos of the property. Photo uploads are not available.",
              )}
            </p>
          </fieldset>
          <div className="management-actions">
            <button className="btn btn-primary" disabled={busy || !ready}>
              {busy
                ? t("正在保存…", "Saving…")
                : editing
                  ? t("保存修改", "Save changes")
                  : t("保存为草稿", "Save draft")}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={cancelEditor}
            >
              {t("取消", "Cancel")}
            </button>
            <span className="muted">
              {t(
                "保存草稿不会公开房源。",
                "Saving a draft does not publish your listing.",
              )}
            </span>
          </div>
        </form>
      </details>
      {ready && (
        <>
          <p className="management-result-count" role="status">
            {t(
              `显示 ${visibleListings.length} 个房源`,
              `${visibleListings.length} listings in this view`,
            )}
          </p>
          {!visibleListings.length && (
            <div className="empty-state">
              <h2>
                {listings.length
                  ? t("暂无此状态的房源", "No listings with this status")
                  : t("从你的第一个房源开始", "Start with your first listing")}
              </h2>
              <p>
                {listings.length
                  ? t(
                      "选择其他状态查看房源。",
                      "Choose another status to see your listings.",
                    )
                  : t(
                      "添加房屋信息、房间与费用约定，保存后即可确认发布。",
                      "Add the home, rooms and utility terms, then review your draft before publishing.",
                    )}
              </p>
              <button
                className="btn btn-secondary"
                onClick={
                  listings.length ? () => setFilter("all") : () => openEditor()
                }
              >
                {listings.length
                  ? t("查看全部房源", "Show all listings")
                  : t("添加房源", "Add a listing")}
              </button>
            </div>
          )}
          <div className="management-list">
            {visibleListings.map((item) => (
              <article className="management-card" key={item.id}>
                <div className="management-card-heading">
                  <div>
                    <div className="management-tags">
                      <span
                        className={`management-status management-status-${listingStatus(item)}`}
                      >
                        {!item.city
                          ? t("历史房源", "Legacy property")
                          : item.isPublished
                            ? t("已发布", "Published")
                            : t("草稿 / 已下架", "Draft / unpublished")}
                      </span>
                    </div>
                    <h2>{item.title}</h2>
                    <p className="muted">
                      {item.city
                        ? [item.neighborhood, item.city]
                            .filter(Boolean)
                            .join(" · ")
                        : t(
                            "保留原有账单与入住记录，不作为公开租赁房源。",
                            "Existing bills and stays are preserved; this is not a public rental listing.",
                          )}
                    </p>
                  </div>
                  {item.advertisedRent != null && (
                    <p className="management-price">
                      <strong>EUR {item.advertisedRent}</strong>
                      <span>
                        {item.rentalMode === "ROOMS"
                          ? t("/ 间 / 月", "/ room / month")
                          : t("/ 月", "/ month")}
                      </span>
                    </p>
                  )}
                </div>
                <dl className="management-facts">
                  <div>
                    <dt>{t("出租方式", "Rental mode")}</dt>
                    <dd>
                      {item.rentalMode === "ROOMS"
                        ? t("按房间出租", "By room")
                        : t("整套出租", "Entire home")}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {item.rentalMode === "ROOMS"
                        ? t("出租房间", "Rental rooms")
                        : t("整套房间数", "Rooms in home")}
                    </dt>
                    <dd>
                      {item.rentalMode === "ROOMS"
                        ? item.rooms.length
                        : item.roomCount}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("申请", "Applications")}</dt>
                    <dd>{item._count.applications}</dd>
                  </div>
                  <div>
                    <dt>{t("入住记录", "Occupancy records")}</dt>
                    <dd>{item._count.tenancies}</dd>
                  </div>
                  {item.availableFrom && (
                    <div>
                      <dt>{t("可入住日期", "Available from")}</dt>
                      <dd>{item.availableFrom.slice(0, 10)}</dd>
                    </div>
                  )}
                  {item.sizeM2 != null && (
                    <div>
                      <dt>{t("整套面积", "Whole-home area")}</dt>
                      <dd>{item.sizeM2} m²</dd>
                    </div>
                  )}
                </dl>
                {item.rentalMode === "ROOMS" && item.rooms.length > 0 && (
                  <p className="muted">
                    {item.rooms
                      .map(
                        (room) =>
                          `${room.name} · ${room.capacity} ${t("人", "people")}`,
                      )
                      .join(" / ")}
                  </p>
                )}
                {item.city && (
                  <details className="management-saved-details">
                    <summary>
                      {t("已保存的房源信息", "Saved listing details")}
                    </summary>
                    <p>{item.description}</p>
                    <p>
                      {t("详细地址（不公开）：", "Full address (private): ")}
                      {item.address}
                    </p>
                    <p>
                      {item.furnished
                        ? t("带家具", "Furnished")
                        : t("不带家具", "Unfurnished")}
                    </p>
                  </details>
                )}
                {item.editBlockReason && (
                  <p className="muted">
                    {editBlockMessages[item.editBlockReason]}
                  </p>
                )}
                <div className="management-actions">
                  {item.editBlockReason === null && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || !ready}
                      onClick={() => openEditor(item)}
                    >
                      {t("编辑草稿", "Edit draft")}
                    </button>
                  )}
                  {item.city && item.isPublished && (
                    <Link className="text-link" href={"/properties/" + item.id}>
                      {t("查看公开房源", "View public listing")}
                    </Link>
                  )}
                  <Link className="text-link" href="/rental/applications">
                    {t("查看所有申请", "Review all applications")}
                  </Link>
                  {!item.city && (
                    <Link className="text-link" href="/organizer/bills/new">
                      {t("管理水电账单", "Manage utility bills")}
                    </Link>
                  )}
                </div>
                {item.city && (
                  <details className="management-publication">
                    <summary>
                      {item.isPublished
                        ? t("下架房源", "Unpublish listing")
                        : t("核对并发布", "Review & publish")}
                    </summary>
                    <p>
                      {item.isPublished
                        ? t(
                            "下架后不再接受新的公开申请；已有申请、入住与账单保留。",
                            "Unpublishing stops new public applications. Existing applications, stays and bills remain.",
                          )
                        : t(
                            "发布后，租客可在找房页查看房源并申请。请先核对以上信息与以下费用约定。",
                            "Publishing lets tenants find and apply for this home. Review the details above and the terms below first.",
                          )}
                    </p>
                    <p className="management-terms">
                      {en ? policyText.en : policyText.zh}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void publish(item.id, !item.isPublished);
                      }}
                    >
                      <label className="management-check">
                        <input type="checkbox" required disabled={busy} />
                        {t(
                          "我确认房源信息与上述费用约定，执行本次发布状态变更。",
                          "I confirm these listing details and utility terms for this publication change.",
                        )}
                      </label>
                      <button
                        className={
                          item.isPublished
                            ? "btn btn-secondary"
                            : "btn btn-primary"
                        }
                        disabled={busy}
                      >
                        {busy
                          ? t("处理中…", "Processing…")
                          : item.isPublished
                            ? t("确认下架", "Confirm unpublish")
                            : t("确认并发布", "Confirm & publish")}
                      </button>
                    </form>
                  </details>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </RentalFrame>
  );
}
