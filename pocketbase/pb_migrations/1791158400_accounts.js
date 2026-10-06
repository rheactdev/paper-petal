// Applied automatically on serve. No superuser credentials are needed by the app.
migrate((app) => {
  let users;
  try {
    users = app.findCollectionByNameOrId("users");
  } catch {
    users = new Collection({ type: "auth", name: "users" });
  }
  if (users.type !== "auth")
    throw new Error("users must be an auth collection");
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.createRule = "@request.body.verified:isset = false";
  users.updateRule =
    "id = @request.auth.id && @request.body.verified:changed = false";
  users.deleteRule = "id = @request.auth.id";
  users.manageRule = null;
  users.authRule = "";
  users.passwordAuth = { enabled: true, identityFields: ["email"] };
  users.authToken.duration = 604800;
  users.fields.getByName("email").required = true;
  users.fields.getByName("password").min = 8;
  users.fields.getByName("password").max = 71;
  let name = users.fields.getByName("name");
  if (!name) users.fields.add(new TextField({ name: "name", max: 80 }));
  else name.max = 80;
  app.save(users);
  const settings = app.settings();
  settings.meta.appName = "Paper & Petal";
  settings.rateLimits.enabled = true;
  settings.rateLimits.rules = [
    {
      label: "/api/collections/users/auth-with-password",
      audience: "",
      duration: 60,
      maxRequests: 20,
    },
    {
      label: "POST /api/collections/users/records",
      audience: "",
      duration: 60,
      maxRequests: 10,
    },
    { label: "/api/", audience: "", duration: 10, maxRequests: 300 },
  ];
  app.save(settings);
});
