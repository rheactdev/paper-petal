migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    app.save(
      new Collection({
        type: "base",
        name: "user_assets",
        listRule: '@request.auth.id != "" && owner = @request.auth.id',
        viewRule: '@request.auth.id != "" && owner = @request.auth.id',
        createRule: '@request.auth.id != "" && owner = @request.auth.id',
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            type: "relation",
            name: "owner",
            collectionId: users.id,
            required: true,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            type: "select",
            name: "kind",
            values: ["font", "sticker"],
            required: true,
            maxSelect: 1,
          },
          { type: "text", name: "name", required: true, max: 200 },
          { type: "text", name: "mimeType", required: true, max: 100 },
          {
            type: "number",
            name: "size",
            required: true,
            min: 1,
            max: 20971520,
            onlyInt: true,
          },
          {
            type: "text",
            name: "hash",
            required: true,
            pattern: "^[a-f0-9]{64}$",
          },
          {
            type: "file",
            name: "file",
            required: true,
            maxSelect: 1,
            maxSize: 20971520,
            protected: true,
            mimeTypes: [
              "image/png",
              "image/jpeg",
              "image/webp",
              "font/ttf",
              "font/otf",
              "font/woff",
              "font/woff2",
              "application/font-sfnt",
              "application/font-woff",
              "application/vnd.ms-opentype",
              "application/octet-stream",
            ],
          },
          { type: "autodate", name: "created", onCreate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_user_asset_hash ON user_assets (owner, kind, hash)",
        ],
      }),
    );
  },
  (app) => app.delete(app.findCollectionByNameOrId("user_assets")),
);
