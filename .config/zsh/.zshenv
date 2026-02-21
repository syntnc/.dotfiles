# XDG Base Directory
export XDG_CACHE_HOME=$HOME/.cache
export XDG_CONFIG_HOME=$HOME/.config
export XDG_DATA_HOME=$HOME/.local/share
export XDG_DESKTOP_HOME=$HOME/.local/desktop
export XDG_STATE_HOME=$HOME/.local/state

export ZDOTDIR=$XDG_CONFIG_HOME/zsh
[ -d "$XDG_STATE_HOME"/zsh ] || mkdir -p "$XDG_STATE_HOME"/zsh
export HISTFILE="$XDG_STATE_HOME"/zsh/history
[ -d "$XDG_CACHE_HOME"/zsh ] || mkdir -p "$XDG_CACHE_HOME"/zsh

export HISTSIZE=1000000
export SAVEHIST=1000000

export EDITOR=nvim
export VISUAL=nvim

export GOPATH=$XDG_DATA_HOME/go
export GOMODCACHE=$XDG_CACHE_HOME/go/mod
export PATH=$GOPATH/bin:$PATH

export CARGO_HOME=$XDG_DATA_HOME/cargo
export PATH=$CARGO_HOME/bin:$PATH

export DOCKER_CONFIG=$XDG_CONFIG_HOME/docker

export PYENV_ROOT=$XDG_DATA_HOME/pyenv
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"

export PATH=$XDG_DATA_HOME/.local/bin:$PATH
