let appModule;

export default async function handler(req, res) {
  appModule ??= import("../dist/index.mjs");
  const { default: app } = await appModule;
  return app(req, res);
}
