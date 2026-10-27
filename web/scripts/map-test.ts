import assert from "node:assert/strict";
import { amapNavigationUrl } from "../src/lib/campus-map";

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
  console.log("Map checks passed: server-only secret, fixed upstream, callback guard, failure handling, accurate campus POI and navigation coordinates.");
}
void main();
