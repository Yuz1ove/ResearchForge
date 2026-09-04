import assert from "node:assert/strict";
import test from "node:test";
import { buildGeneralResearchQueryPlan } from "./general-research-query-planner";

const cases = [
  ["education", "生成式 AI 使用對學生批判思考能力的影響", "生成式 AI 使用", "學生批判思考能力"],
  ["environment", "電動車與燃油車生命週期碳排放的比較", "電動車", "生命週期碳排放"],
  ["biology", "微塑膠暴露對淡水魚類生理功能的影響", "微塑膠暴露", "淡水魚類生理功能"],
  ["social science", "社群媒體演算法推薦與政治極化之間的關聯", "社群媒體演算法推薦", "政治極化"],
  ["computer science", "Retrieval-Augmented Generation 對大型語言模型 hallucination 的影響", "Retrieval-Augmented Generation", "大型語言模型 hallucination"],
] as const;

for (const [domain, topic, exposure, outcome] of cases) {
  test(`query-neutral planner decomposes unseen ${domain} topic`, () => {
    const plan = buildGeneralResearchQueryPlan(topic);
    assert.equal(plan.dimensions.exposureOrIntervention, exposure);
    assert.equal(plan.dimensions.outcome, outcome);
    assert.ok(plan.queries.length >= 5 && plan.queries.length <= 8);
    assert.ok(plan.studyDesignQueries.some((query) => /systematic review|cohort|benchmark/iu.test(query)));
    assert.ok(plan.queries.every((query) => query.includes(exposure)));
  });
}

test("comparison and population dimensions remain separate when explicitly expressed", () => {
  const comparison = buildGeneralResearchQueryPlan("高強度間歇訓練與中等強度持續運動對心肺適能的比較");
  assert.equal(comparison.dimensions.relationship, "comparison");
  assert.equal(comparison.dimensions.comparator, "中等強度持續運動");
  assert.equal(comparison.dimensions.outcome, "心肺適能");

  const population = buildGeneralResearchQueryPlan("咖啡因攝取對高中生注意力與睡眠的影響");
  assert.equal(population.dimensions.populationOrEntity, "高中生");
});

test("contextual environmental effect syntax yields a complete query plan", () => {
  const plan = buildGeneralResearchQueryPlan("都市熱島環境中綠屋頂的降溫效果");
  assert.equal(plan.dimensions.relationship, "effect");
  assert.equal(plan.dimensions.context, "都市熱島");
  assert.equal(plan.dimensions.exposureOrIntervention, "綠屋頂");
  assert.equal(plan.dimensions.outcome, "降溫");
  assert.ok(plan.queries.length >= 5 && plan.queries.length <= 8);
  assert.ok(plan.queries.every((query) => query.includes("綠屋頂")));
});
