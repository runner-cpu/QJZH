# Compensation Algorithm Lock

`model_weights.js` and `compensator_engine.js` are production model assets.
They must remain separate from the dashboard UI and must not be copied into
`index.html`, `simulator.js`, or `ui_interactions.js`.

Required page load order:

1. `model_weights.js?v=<model-version>`
2. `compensator_engine.js?v=<model-version>`
3. UI and simulator scripts

Before publishing any UI change, run:

```powershell
node verify_compensator.js
node verify-deployment.js .
```

`knowledge-base-rules.md` is generated from `knowledgeBase.js`. After changing
the local expert rules, run `node generate-knowledge-base-document.js` before
the deployment verification. The knowledge-base verification checks the source
hash and blocks a stale rule document.

The GitHub Actions workflow runs the same check for pushes and pull requests.
When retraining the model, replace only `model_weights.js`, increment the query
version in `index.html` and `online_test.html`, then update the expected version
in `verify_compensator.js`.
