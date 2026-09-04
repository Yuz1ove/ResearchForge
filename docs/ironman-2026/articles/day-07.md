# Day 07｜三個學術 Provider，三種資料形狀

串接第一個學術 API 時，問題通常像資料抓取：送 query，拿 JSON，顯示標題。串到第三個時，問題開始像資料建模：哪個欄位才是同一個概念？缺少摘要代表沒有摘要，還是這個 provider 不提供？同一個 DOI 出現三次，要保留哪一筆？某個服務 timeout 時，整次搜尋算失敗嗎？

ResearchForge 使用 OpenAlex、Crossref 與 Semantic Scholar 取得學術來源。它們都能回傳 scholarly metadata，但「都在找論文」不等於它們共享同一種資料世界。

讀者若想直接查看服務邊界，可參考 [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) 與 [OpenAlex API 文件](https://help.openalex.org/)。這些官方文件說明各自提供的 metadata 與介面；它們不替 ResearchForge 的歷史驗收背書。

如果把 provider-specific response 直接帶進前端，這些差異會一路污染整個產品：來源卡要寫三套判斷，去重要知道三種 ID，相關性評分要處理三種缺值，Writer 前處理又得重新猜一次。新增第四個 provider 時，所有下游模組都可能跟著改。

## Adapter 的工作不是改欄位名稱

ResearchForge 的 provider layer 先把外部資料轉成共同的 `SourceRecord`。最表面的工作是統一 title、authors、year、DOI、URL、abstract、source type 與 provider ID；更深的工作是保存「這個值是怎麼來的」以及「缺值代表什麼」。

例如 DOI 需要正規化，URL 可能要從 DOI 或 provider landing page 選擇，OpenAlex 的 abstract 可能以 inverted index 表示，需要先重建文字。Crossref、OpenAlex 和 Semantic Scholar 各自有不同的 author、venue 與 access metadata。Adapter 不能把所有差異磨平到看不見，否則下游會誤以為三種來源具有相同資訊密度。

一個較好的 normalized record 會同時提供共同欄位與 provider provenance。共同欄位讓後續流程能比較，provenance 則讓系統在發生衝突或缺值時回到原始來源。

```ts
// 簡化示意，不是 exact production type
type SourceRecord = {
  canonicalId: string | null;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  doi: string | null;
  provider: "OpenAlex" | "Crossref" | "Semantic Scholar";
  providerIds: Record<string, string>;
};
```

這種 adapter 架構看起來增加了程式碼，實際上是在保護下游。UI 不必知道 OpenAlex abstract 如何重建；deduper 不必為每個 provider 寫一條平行路徑；新增 provider 時，也先在邊界完成轉換。

## Provider 成功，並不代表搜尋成功

另一個早期容易犯的錯，是只看 HTTP request 有沒有回來。只要三個服務中有一個回 200，就把整次搜尋標成成功。但研究流程真正關心的不是 transport success，而是結果有沒有通過 normalization、topic relevance、identity 與 evidence gate。

一個 provider 可以正常回傳數十筆資料，最後卻全部離題；另一個 provider 可能 timeout，但其他服務已經提供足夠候選。這兩種情況都不能只用 success/failed 表示。

ResearchForge 因此逐步加入 provider health、timeout、rate limit、retryability、result count 與 degraded diagnostics。這些診斷不是要把後端 log 搬到使用者面前，而是讓 orchestration 知道下一步怎麼做：等待、換路徑、保留部分結果，還是明確告訴使用者目前只有低信心候選。

## Fallback 最怕悄悄改題

當 provider 對長 query 表現不好時，一個常見 fallback 是把查詢縮短再試一次。這招可能提高回傳率，也可能把最重要的 topic anchor 一起刪掉。

例如原 query 同時包含族群、暴露與 outcome，縮短後只剩一個熱門名詞，provider 很可能回傳大量看似相關的資料。從 request 指標看，fallback 成功；從研究問題看，它已經換題。

所以 fallback 不能只屬於 provider adapter。Provider 可以知道哪些錯誤值得重試，但「縮短成什麼仍算同一題」應該由 topic-aware planner 決定。這是責任分工很細但很重要的地方：transport layer 決定如何可靠送達，research planner 決定語意能不能改。

## 不要用來源數量替代 coverage

多 provider 的另一個幻覺，是來源數看起來很豐富。畫面出現許多卡片，好像已經做了充分研究；實際上，同一篇論文可能跨 provider 重複，許多結果也可能只是 review、commentary 或 metadata-only。

真正有意義的不是 raw result count，而是去重後有多少候選、多少符合題目、多少是 direct study、多少能取得足夠內容、最後有哪些 evidence gaps。這些指標屬於不同階段，不該被壓扁成一個來源總數。

Provider 增加的是入口，不保證終點。這個更嚴格的 coverage 分層是後來泛化測試才建立的，不能倒寫成 6 月已完成。

## Partial success 應該怎麼回給使用者

較好的回應是分層：資料層保留已取得來源與各 provider outcome；研究層判斷目前是否值得進入 review；前台則用可行動語言說明結果可能不完整。Provider diagnostics 要從 exception message 變成 domain state，卻不必把原始 telemetry 全倒給使用者。

Provider 之間若在年份、作者或 DOI 上衝突，normalizer 也不能只挑最長記錄覆蓋其他來源。較強 identifier 可協助 work identity，欄位差異仍要保留 provenance。Adapter 負責資料邊界，不應偷偷決定 evidence eligibility。

## 多來源系統真正需要的是共同語言

把三個 API 串起來，只是 integration；讓它們在同一套 identity、relevance、review 與 provenance 規則下合作，才是 architecture。

這個觀念同樣適用於任何多來源 agent：搜尋引擎、CRM、文件庫、資料庫與人工輸入都可能描述同一個實體。若每個下游自己解釋 provider-specific data，系統遲早會出現分歧。先建立 canonical-ish 的共同資料語言，再保留來源差異，通常比在最後一刻修 prompt 穩定得多。

共同語言建立後，三個 provider 可能仍在描述同一篇研究。若去重失敗，來源數、投票、證據密度與人工審查都會被扭曲；若合併太積極，又可能把不同版本或不同研究錯當成同一筆。Adapter 解決資料形狀，work identity 才負責回答「這究竟是不是同一篇」。
