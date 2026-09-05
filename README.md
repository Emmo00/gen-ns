# GenNS — GenLayer Name Service

A decentralized name service built on [GenLayer](https://genlayer.com) with commit/reveal registration, subdomains, resolver records, primary names, premium pricing, and LLM-adjudicated disputes.

## Project Structure

```
contracts/
  name_service.py      # GenLayer intelligent contract (Python)
frontend/
  index.html           # SPA shell
  styles.css           # UI styles
  app.js               # Router, views, contract interactions
  mock-data.js         # GenLayerJS SDK client + contract wrappers
```

## Contract

- **Runner:** `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
- **Network:** studionet
- **Default address:** `0x6F4744CEa4dCc0F4f196D214A7fA58eB0fde2173`

Key features: commit/reveal name registration (1–5 years), length-based pricing, subdomains, transfer, renew, dispute resolution via LLM adjudication.

## Frontend

Serve locally:

```bash
cd frontend
python -m http.server 8080
```

Then open `http://localhost:8080`. Requires MetaMask connected to the GenLayer studionet.

## Development

Install skills and linter:

```bash
npx skills add genlayerlabs/genlayer-genesis --skill write-contract --yes
npx skills add genlayerlabs/genlayer-genesis --skill genvm-lint --yes
```

Lint the contract:

```bash
genvm-lint check contracts/name_service.py
```
