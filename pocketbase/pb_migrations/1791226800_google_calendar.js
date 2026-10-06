migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const collection = new Collection({
    type: "base",
    name: "google_calendar_links",
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: '@request.auth.id != "" && owner = @request.auth.id',
    updateRule:
      "owner = @request.auth.id && @request.body.owner:changed = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      {
        type: "relation",
        name: "owner",
        collectionId: users.id,
        required: true,
        maxSelect: 1,
        cascadeDelete: true,
      },
      // Only server-encrypted credentials are stored. AAD binds them to the owner.
      { type: "text", name: "credentials", required: true, max: 20000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_google_calendar_owner ON google_calendar_links (owner)",
    ],
  });
  app.save(collection);
});
