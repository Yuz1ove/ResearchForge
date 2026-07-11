let appModule;

module.exports = async (req, res) => {
  appModule ??= import("../dist/index.mjs");
  const { default: app } = await appModule;
  return app(req, res);
};
