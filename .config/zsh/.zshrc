# -----------------------------------------------------------------------------
# Options
# -----------------------------------------------------------------------------
setopt autocd
setopt autolist
setopt completealiases
setopt completeinword
setopt correct
setopt extendedglob
setopt nobeep
setopt nolisttypes

setopt appendhistory
setopt hist_find_no_dups
setopt hist_ignore_all_dups
setopt hist_ignore_dups
setopt hist_ignore_space
setopt hist_save_no_dups
setopt inc_append_history
setopt sharehistory

# Not in .zshenv: can be clobbered by /etc/zshrc
export HISTFILE=$XDG_STATE_HOME/zsh/history
export HISTSIZE=1000000
export SAVEHIST=1000000

# Reinstate session dir (hardcoded by Apple Terminal)
if [[ "$(uname)" == "Darwin" ]]; then
    if [[ -n "$TERM_SESSION_ID" ]]; then
        export SHELL_SESSION_DIR=$XDG_STATE_HOME/zsh/sessions
        export SHELL_SESSION_FILE="$SHELL_SESSION_DIR/$TERM_SESSION_ID.session"
        [[ -d "$SHELL_SESSION_DIR" ]] || mkdir -m 700 -p "$SHELL_SESSION_DIR"
    fi
fi

# -----------------------------------------------------------------------------
# Set up fpath for manually generated completions
# -----------------------------------------------------------------------------
local ZSH_COMPDIR="$XDG_DATA_HOME/zsh/site-functions"
[[ -d "$ZSH_COMPDIR" ]] || mkdir -p "$ZSH_COMPDIR"
fpath=("$ZSH_COMPDIR" $fpath)

# -----------------------------------------------------------------------------
# Load completions
# -----------------------------------------------------------------------------
local ZSH_COMPDUMP="$XDG_CACHE_HOME/zsh/zcompcache"
_comp_files=($ZSH_COMPDUMP(Nm-20))
autoload -Uz compinit
if (( $#_comp_files )); then
    compinit -i -C -d "$ZSH_COMPDUMP"
else
    compinit -i -d "$ZSH_COMPDUMP"
fi
unset _comp_files

# -----------------------------------------------------------------------------
# Source associated files
# -----------------------------------------------------------------------------
[[ ! -f $ZDOTDIR/.zsh_aliases ]] || source $ZDOTDIR/.zsh_aliases

# -----------------------------------------------------------------------------
# Set up zinit
# -----------------------------------------------------------------------------
ZINIT_HOME=$XDG_DATA_HOME/zinit/zinit.git
[ ! -d $ZINIT_HOME ] && mkdir -p $(dirname $ZINIT_HOME)
[ ! -d $ZINIT_HOME/.git ] && git clone https://github.com/zdharma-continuum/zinit.git $ZINIT_HOME

if [[ ! -f $ZINIT_HOME/zinit.zsh ]]; then
    print -P "%F{33} %F{220}Installing %F{33}ZDHARMA-CONTINUUM%F{220} Initiative Plugin Manager (%F{33}zdharma-continuum/zinit%F{220})…%f"
    command mkdir -p $(dirname $ZINIT_HOME) && command chmod g-rwX $(dirname $ZINIT_HOME)
    command git clone https://github.com/zdharma-continuum/zinit $ZINIT_HOME && \
        print -P "%F{33} %F{34}Installation successful.%f%b" || \
        print -P "%F{160} The clone has failed.%f%b"
fi

source $ZINIT_HOME/zinit.zsh
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

# Load a few important annexes, without Turbo
# (this is currently required for annexes)
zinit light-mode for \
    zdharma-continuum/zinit-annex-as-monitor \
    zdharma-continuum/zinit-annex-bin-gem-node \
    zdharma-continuum/zinit-annex-patch-dl \
    zdharma-continuum/zinit-annex-rust

# -----------------------------------------------------------------------------
# Add in zsh plugins
# -----------------------------------------------------------------------------
# load order matters:
#   - fzf-tab before widget-wrapping plugins (autosuggestions, syntax highlights)
#   - zsh-history-substring-search after widget plugins
#   - fast-syntax-highlighting in the end
zinit light zsh-users/zsh-completions
zinit light Aloxaf/fzf-tab
zinit light zsh-users/zsh-autosuggestions
zinit light softmoth/zsh-vim-mode
zinit light zsh-users/zsh-history-substring-search
zinit light zdharma-continuum/fast-syntax-highlighting

# -----------------------------------------------------------------------------
# Add in snippets
# -----------------------------------------------------------------------------
zinit snippet OMZP::git
zinit snippet OMZP::sudo
zinit snippet OMZP::kubectl
zinit snippet OMZP::kubectx
zinit snippet OMZP::command-not-found

zinit cdreplay -q

zmodload zsh/terminfo

# -----------------------------------------------------------------------------
# Completion styling
# -----------------------------------------------------------------------------
zstyle ':completion:*' cache-path "$XDG_CACHE_HOME"/zsh/compcache
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}' 'r:|[._-]=* r:|=*' 'l:|=* r:|=*'
zstyle ':completion:*' menu select
zstyle ':completion:*' rehash true
zstyle ':completion:*' verbose yes

zstyle ':completion:*:paths' accept-exact '*(N)'
zstyle ':completion::complete:*' use-cache on

zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza -1 --color=always --icons $realpath'
zstyle ':fzf-tab:*' switch-group '<' '>'

# -----------------------------------------------------------------------------
# Shell bindings
# -----------------------------------------------------------------------------
# Activate vi mode
bindkey -v

# Mode-agnostic bindings
bindkey '^n' history-search-forward
bindkey '^p' history-search-backward
bindkey "$terminfo[kcuu1]" history-substring-search-up
bindkey "$terminfo[kcud1]" history-substring-search-down
bindkey '^[[A' history-substring-search-up
bindkey '^[0A' history-substring-search-up
bindkey '^[[B' history-substring-search-down
bindkey '^[0B' history-substring-search-down

# Command mode bindings
bindkey -M vicmd '^[[A' history-substring-search-up
bindkey -M vicmd '^[0A' history-substring-search-up
bindkey -M vicmd '^[[B' history-substring-search-down
bindkey -M vicmd '^[0B' history-substring-search-down

# Insert mode bindings
bindkey -M viins '^[[A' history-substring-search-up
bindkey -M viins '^[0A' history-substring-search-up
bindkey -M viins '^[[B' history-substring-search-down
bindkey -M viins '^[0B' history-substring-search-down

# -----------------------------------------------------------------------------
# ZLE (zsh line editor)
# -----------------------------------------------------------------------------

# Stop search on navigation keys
bindkey -M isearch '^[[A' history-substring-search-up
bindkey -M isearch '^[[B' history-substring-search-down
bindkey -M isearch '^[[C' forward-char
bindkey -M isearch '^[[D' backward-char

bindkey ' ' magic-space

# -----------------------------------------------------------------------------
# Shell integrations
# -----------------------------------------------------------------------------
if [[ "$(uname)" == "Darwin" ]]; then
    if [[ -f "/opt/homebrew/bin/brew" ]]; then # Apple Silicon
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -f "/usr/local/bin/brew" ]]; then # Intel (legacy)
        eval "$(/usr/local/bin/brew shellenv)"
    fi
fi

# Must be after Homebrew shell integration to ensure bob nvim wins
case ":$PATH:" in
  *":$BOB_HOME/nvim-bin:"*) ;;
  *) export PATH="$BOB_HOME/nvim-bin:$PATH" ;;
esac

eval "$(fzf --zsh)"
eval "$(direnv hook zsh)"
eval "$(zoxide init zsh)"
eval "$(starship init zsh)"

if command -v wt >/dev/null 2>&1; then
    eval "$(command wt config shell init zsh)"
fi
