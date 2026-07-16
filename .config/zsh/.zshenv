# XDG Base Directory
export XDG_CACHE_HOME=$HOME/.cache
export XDG_CONFIG_HOME=$HOME/.config
export XDG_DATA_HOME=$HOME/.local/share
export XDG_DESKTOP_HOME=$HOME/.local/desktop
export XDG_STATE_HOME=$HOME/.local/state

export ZDOTDIR=$XDG_CONFIG_HOME/zsh
[ -d "$XDG_STATE_HOME"/zsh ] || mkdir -p "$XDG_STATE_HOME"/zsh
[ -d "$XDG_CACHE_HOME"/zsh ] || mkdir -p "$XDG_CACHE_HOME"/zsh

export EDITOR=nvim
export VISUAL=nvim

export GOPATH=$XDG_DATA_HOME/go
export GOMODCACHE=$XDG_CACHE_HOME/go/mod
export PATH=$GOPATH/bin:$PATH

export CARGO_HOME=$XDG_DATA_HOME/cargo
export PATH=$CARGO_HOME/bin:$PATH

export PNPM_HOME=$XDG_DATA_HOME/pnpm
case ":$PATH:" in
  *":$PNPM_HOME/bin:"*) ;;
  *) export PATH="$PNPM_HOME/bin:$PATH" ;;
esac

export DOCKER_CONFIG=$XDG_CONFIG_HOME/docker

export PYTHON_HISTORY=$XDG_STATE_HOME/python_history
export PYTHONPYCACHEPREFIX=$XDG_CACHE_HOME/python
export PYTHONUSERBASE=$XDG_DATA_HOME/python

export STARSHIP_CONFIG=$XDG_CONFIG_HOME/starship/starship.toml

export PATH=$HOME/.local/bin:$PATH
export PATH=$XDG_DATA_HOME/bob/nvim-bin:$PATH
