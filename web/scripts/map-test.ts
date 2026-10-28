import assert from "node:assert/strict";
import { amapNavigationUrl, amapSearchUrl, normalizeCampusPlace, normalizePlaceName, placeSearchNames } from "../src/lib/campus-map";

async function main() {
  process.env.AMAP_JS_API_KEY = "test-public-key";
  process.env.AMAP_SECURITY_JSCODE = "test-server-secret";
  const { GET } = await import("../src/lib/server/amap-proxy");
  const { GET: config } = await import("../src/app/api/maps/config/route");
  const publicConfig = JSON.stringify(await config().json());
  assert.ok(publicConfig.includes("test-public-key"));
  assert.ok(!publicConfig.includes("test-server-secret"));

  let called = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    called++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://restapi.amap.com");
    assert.equal(url.pathname, "/v3/place/text");
    assert.equal(url.searchParams.get("jscode"), "test-server-secret");
    assert.equal(url.searchParams.get("key"), "test-public-key");
    return new Response('{"status":"1","test":"test-server-secret"}', { headers: { "content-type": "application/json" } });
  };
  const request = (path: string[], query = "") => GET(new Request("https://campus.test/_AMapService/" + path.join("/") + query), { params: Promise.resolve({ path }) });
  try {
    assert.equal((await request(["https:", "evil.test"])).status, 404);
    assert.equal((await request(["v3", "place", "text"], "?callback=x%28alert%281%29%29")).status, 400);
    assert.equal((await request(["v3", "place", "text"], "?callback=safe&callback=evil%28%29")).status, 400);
    assert.equal(called, 0);
    const response = await request(["v3", "place", "text"], "?key=override&jscode=override&keywords=school");
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes("test-server-secret"));
    globalThis.fetch = async () => { throw new Error("private upstream error"); };
    const unavailable = await request(["v3", "place", "text"]);
    assert.equal(unavailable.status, 502);
    assert.ok(!(await unavailable.text()).includes("private"));
  } finally { globalThis.fetch = realFetch; }

  Reflect.set(globalThis, "window", { setTimeout, clearTimeout });
  const { searchCampusPlace } = await import("../src/lib/amap-client");
  const location = { getLng: () => 113.9, getLat: () => 22.9 };
  const sdk = {
    Map: class {}, Marker: class {},
    PlaceSearch: class {
      search(_word: string, callback: (state: string, data: unknown) => void) {
        callback("complete", { poiList: { pois: [
          { id: "correct", name: "东莞城市学院图书馆", address: "校内", location },
          { id: "wrong", name: "香港城市大学图书馆", address: "东莞", location },
          { id: "shop", name: "Apple体验中心(东莞城市学院)", address: "图书馆二楼", location },
        ] } });
      }
    },
  };
  const result = await searchCampusPlace(sdk as unknown as Parameters<typeof searchCampusPlace>[0], { name: "图书馆", kind: "library" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "correct");
  const navigation = new URL(amapNavigationUrl(result[0]));
  assert.equal(navigation.searchParams.get("to"), "113.9,22.9,东莞城市学院图书馆");
  assert.equal(navigation.searchParams.get("coordinate"), "gaode");
  assert.equal(navigation.searchParams.has("from"), false);
  const unknown = await searchCampusPlace(sdk as unknown as Parameters<typeof searchCampusPlace>[0], { name: "不存在的教学楼", kind: "building" });
  assert.equal(unknown.length, 0);
  type Sdk = Parameters<typeof searchCampusPlace>[0];
  type Callback = Parameters<InstanceType<Sdk["PlaceSearch"]>["search"]>[1];
  const makeSdk = (search: (word: string, callback: Callback) => void) => ({
    ...sdk, PlaceSearch: class { search = search; },
  }) as unknown as Sdk;

  // 线上真实回包包含田径场，旧版因名称不含“操场”而丢弃。
  const trackSdk = makeSdk((_word, callback) => callback("complete", { poiList: { pois: [
    { id: "track", name: "东莞城市学院田径场", address: "寮步镇文昌路1号东莞城市学院", location },
    { id: "other-campus", name: "其他学校操场", address: "东莞", location },
  ] } }));
  assert.equal((await searchCampusPlace(trackSdk, { name: "操场", kind: "campus" }))[0]?.id, "track");
  assert.equal(normalizePlaceName("东莞理工学院城市学院（学三饭堂）"), "学3食堂");
  assert.equal(normalizePlaceName("东莞城市学院第3食堂"), "第3食堂");
  assert.notEqual(normalizePlaceName("学3饭堂"), normalizePlaceName("第三食堂"));
  assert.ok(placeSearchNames({ name: "学3饭堂", kind: "dining" }).includes("学三食堂"));

  const queried: string[] = [];
  const diningSdk = makeSdk((word, callback) => {
    queried.push(word);
    callback("complete", { poiList: { pois: [
      ...(word.endsWith("学三食堂") ? [{ id: "dining", name: "学三食堂", address: "东莞理工学院城市学院", location }] : []),
      { id: "wrong-third", name: "东莞理工学院第三食堂", address: "松山湖校区", location },
    ] } });
  });
  assert.equal((await searchCampusPlace(diningSdk, { name: "学3饭堂", kind: "dining" }))[0]?.id, "dining");
  assert.ok(queried.includes("东莞城市学院学三食堂"));

  const dormitory = normalizeCampusPlace({ name: "学三", kind: "building" });
  assert.equal(dormitory.name, "学3宿舍楼");
  assert.equal(new URL(amapSearchUrl(dormitory)).searchParams.get("keyword"), "东莞城市学院学3宿舍楼");
  assert.equal(normalizeCampusPlace({ name: "学三饭堂", kind: "dining" }).kind, "dining");
  const dormSdk = makeSdk((_word, callback) => callback("complete", { poiList: { pois: [
    { id: "dormitory", name: "学3号楼", address: "东莞城市学院", location },
    { id: "wrong-canteen", name: "学3宿舍楼饭堂", address: "东莞城市学院", location },
    { id: "wrong-parking", name: "东莞理工学院城市学院3号楼停车场", location },
    { id: "wrong-dormitory", name: "学6宿舍", address: "东莞城市学院", location },
  ] } }));
  const dormResult = await searchCampusPlace(dormSdk, dormitory);
  assert.equal(dormResult.length, 1);
  assert.equal(dormResult[0].id, "dormitory");

  for (const [input, expected] of [
    ["学一", "学1宿舍楼"], ["学六号楼", "学6宿舍楼"], ["学七宿舍", "学7宿舍楼"],
    ["学十", "学10宿舍楼"], ["学十一号楼", "学11宿舍楼"],
    ["7A", "7A教学楼"], ["7B", "7B教学楼"], ["7C", "7C教学楼"],
    ["5A", "5A教学楼"], ["5B", "5B教学楼"], ["5C", "5C教学楼"],
    ["７ａ", "7A教学楼"], ["教学楼5b", "5B教学楼"],
  ]) {
    const normalized = normalizeCampusPlace({ name: input, kind: "other" });
    assert.equal(normalized.name, expected);
    assert.equal(normalized.kind, "building");
  }
  assert.equal(normalizeCampusPlace({ name: "学六", kind: "dining" }).kind, "building", "bare dormitory name overrides an incorrect tool category");
  assert.equal(normalizeCampusPlace({ name: "7A饭堂", kind: "dining" }).kind, "dining");
  assert.equal(normalizeCampusPlace({ name: "7A301", kind: "other" }).name, "7A301", "do not turn a classroom number into a building alias");
  assert.equal(placeSearchNames({ name: "学七宿舍", kind: "building" })[0], "学7号楼");
  const teachingSdk = makeSdk((_word, callback) => callback("complete", { poiList: { pois: [
    { id: "teaching-7A", name: "东莞城市学院7A区", location },
    { id: "wrong-17A", name: "东莞城市学院17A区", location },
    { id: "wrong-7B", name: "东莞城市学院7B教学楼", location },
    { id: "shop-7A", name: "7A区便利店", address: "东莞城市学院", location },
  ] } }));
  const teachingResult = await searchCampusPlace(teachingSdk, { name: "7a", kind: "building" });
  assert.equal(teachingResult.length, 1);
  assert.equal(teachingResult[0].id, "teaching-7A");
  assert.equal(normalizePlaceName("东莞城市学院-人工智能学院3B区"), "3B");

  let emptyQueries = 0;
  const emptySdk = makeSdk((_word, callback) => { emptyQueries++; callback("no_data", {}); });
  const missing = { name: "学8饭堂", kind: "dining" as const };
  assert.equal((await searchCampusPlace(emptySdk, missing)).length, 0);
  const firstQueries = emptyQueries;
  await searchCampusPlace(emptySdk, missing);
  assert.equal(emptyQueries, firstQueries * 2, "empty results should not block a fresh lookup");

  const retryPlace = { name: "重试图书馆", kind: "library" as const };
  const failedSdk = makeSdk((_word, callback) => callback("error", { info: "INVALID_USER_KEY" }));
  await assert.rejects(searchCampusPlace(failedSdk, retryPlace), /暂不可用/);
  const retrySdk = makeSdk((_word, callback) => callback("complete", { poiList: { pois: [
    { id: "retried", name: "东莞城市学院重试图书馆", location },
  ] } }));
  assert.equal((await searchCampusPlace(retrySdk, retryPlace))[0]?.id, "retried");
  console.log("Map checks passed: proxy/secret guards, track alias, dormitory/canteen separation, name variants, other-campus exclusion, empty/error retries and navigation coordinates.");
}
void main();
