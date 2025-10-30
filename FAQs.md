## `Error failed to bundle project error running bundle_dmg.sh` when building on MacOS with flake

Run those command below:

```bash
sudo xcode-select --reset
sudo xcode-select --switch /Library/Developer/CommandLineTools
```

Reference: https://github.com/NixOS/nixpkgs/issues/355486#issuecomment-2488329223
