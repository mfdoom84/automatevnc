"""
VNC Key Constants

Provides key constants for keyboard operations, compatible with VNC protocol.
"""


class Keys:
    """Key constants for VNC keyboard operations."""
    
    # Modifier keys
    SHIFT = "shift"
    CTRL = "ctrl"
    CONTROL = "ctrl"
    ALT = "alt"
    META = "meta"  # Windows/Command key
    SUPER = "super"
    
    # Special keys
    ENTER = "enter"
    RETURN = "return"
    TAB = "tab"
    SPACE = "space"
    BACKSPACE = "bsp"
    DELETE = "delete"
    ESCAPE = "esc"
    ESC = "esc"
    
    # Navigation keys
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"
    HOME = "home"
    END = "end"
    PAGE_UP = "pgup"
    PAGE_DOWN = "pgdn"
    INSERT = "ins"
    
    # Function keys
    F1 = "f1"
    F2 = "f2"
    F3 = "f3"
    F4 = "f4"
    F5 = "f5"
    F6 = "f6"
    F7 = "f7"
    F8 = "f8"
    F9 = "f9"
    F10 = "f10"
    F11 = "f11"
    F12 = "f12"
    
    # Caps/Num/Scroll lock
    CAPS_LOCK = "caplk"
    NUM_LOCK = "numlk"
    SCROLL_LOCK = "scrlk"
    
    # Print screen / Pause
    PRINT_SCREEN = "printscreen"
    PAUSE = "pause"
    
    @classmethod
    def combo(cls, *keys: str) -> list[str]:
        """
        Create a key combination.
        
        Example:
            Keys.combo(Keys.CTRL, 'c')  # Ctrl+C
            Keys.combo(Keys.CTRL, Keys.SHIFT, 'n')  # Ctrl+Shift+N
        """
        return list(keys)
