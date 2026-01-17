import sys
import random
from PyQt6.QtWidgets import QApplication, QMainWindow, QWidget
from PyQt6.QtCore import Qt, QTimer, QRectF, QPoint
from PyQt6.QtGui import QPainter, QColor, QBrush, QFont

from game_logic import GameLogic

class GameWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.game = GameLogic()
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        
        # Animation state
        self.anim_timer = QTimer()
        self.anim_timer.setInterval(16)  # ~60 FPS
        self.anim_timer.timeout.connect(self.animate)
        self.anim_progress = 1.0  # 0.0 to 1.0
        self.current_moves = []   # List of (from_r, from_c, to_r, to_c, val, merged)
        self.new_tile = None      # (r, c, val) to fade in
        
        # Special Rule state
        self.celebration_message = None
        self.celebration_timer = QTimer()
        self.celebration_timer.setSingleShot(True)
        self.celebration_timer.timeout.connect(self.clear_celebration)
        
        # Mouse Gesture state
        self.mouse_start_pos = None
        
        self.colors = {
            0: (205, 193, 180), 2: (238, 228, 218), 4: (237, 224, 200),
            8: (242, 177, 121), 16: (245, 149, 99), 32: (246, 124, 95),
            64: (246, 94, 59), 128: (237, 207, 114), 256: (237, 204, 97),
            512: (237, 200, 80), 1024: (237, 197, 63), 2048: (237, 194, 46),
        }

    def keyPressEvent(self, event):
        if self.anim_progress < 1.0: return # Ignore input during animation
        
        key = event.key()
        if key == Qt.Key.Key_Left: self.handle_move('LEFT')
        elif key == Qt.Key.Key_Right: self.handle_move('RIGHT')
        elif key == Qt.Key.Key_Up: self.handle_move('UP')
        elif key == Qt.Key.Key_Down: self.handle_move('DOWN')

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.mouse_start_pos = event.pos()

    def mouseReleaseEvent(self, event):
        if self.mouse_start_pos and self.anim_progress >= 1.0:
            diff = event.pos() - self.mouse_start_pos
            if diff.manhattanLength() > 30: # Minimum swipe distance
                if abs(diff.x()) > abs(diff.y()):
                    self.handle_move('LEFT' if diff.x() < 0 else 'RIGHT')
                else:
                    self.handle_move('UP' if diff.y() < 0 else 'DOWN')
        self.mouse_start_pos = None

    def handle_move(self, direction):
        moved, moves, new_tile, new_record = self.game.move(direction)
        if moved:
            self.current_moves = moves
            self.new_tile = new_tile
            self.anim_progress = 0.0
            self.anim_timer.start()
            if new_record:
                self.trigger_celebration()

    def trigger_celebration(self):
        self.celebration_message = random.choice(["Excellent!", "Wow!", "Amazing!", "Fantastic!"])
        self.celebration_timer.start(1500)
        self.update()

    def clear_celebration(self):
        self.celebration_message = None
        self.update()

    def animate(self):
        self.anim_progress += 0.15 # Animation speed
        if self.anim_progress >= 1.0:
            self.anim_progress = 1.0
            self.anim_timer.stop()
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # 1. Background & Score
        painter.setPen(QColor("#776e65"))
        painter.setFont(QFont("Verdana", 20, QFont.Weight.Bold))
        painter.drawText(20, 40, f"Score: {self.game.score}")
        
        grid_size = 400
        start_x = (self.width() - grid_size) // 2
        start_y = (self.height() - grid_size) // 2 + 30
        
        painter.setBrush(QBrush(QColor("#bbada0")))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(start_x, start_y, grid_size, grid_size, 10, 10)
        
        cell_margin = 10
        cell_size = (grid_size - (5 * cell_margin)) // 4
        
        # Helper to get cell rect
        def get_rect(r, c):
            x = start_x + cell_margin + c * (cell_size + cell_margin)
            y = start_y + cell_margin + r * (cell_size + cell_margin)
            return QRectF(x, y, cell_size, cell_size)

        # 2. Draw empty cells (background)
        painter.setBrush(QBrush(QColor(*self.colors[0])))
        for r in range(4):
            for c in range(4):
                painter.drawRoundedRect(get_rect(r, c), 5, 5)

        # 3. Draw moving tiles
        if self.anim_progress < 1.0:
            for from_r, from_c, to_r, to_c, val, merged in self.current_moves:
                # Interpolate position
                rect_from = get_rect(from_r, from_c)
                rect_to = get_rect(to_r, to_c)
                curr_x = rect_from.x() + (rect_to.x() - rect_from.x()) * self.anim_progress
                curr_y = rect_from.y() + (rect_to.y() - rect_from.y()) * self.anim_progress
                
                curr_rect = QRectF(curr_x, curr_y, cell_size, cell_size)
                self.draw_tile(painter, curr_rect, val)
        else:
            # Static board
            for r in range(4):
                for c in range(4):
                    val = self.game.board[r][c]
                    if val != 0:
                        self.draw_tile(painter, get_rect(r, c), val)

        # 4. Celebration Overlay
        if self.celebration_message:
            painter.setBrush(QBrush(QColor(255, 255, 255, 180)))
            painter.drawRoundedRect(start_x, start_y, grid_size, grid_size, 10, 10)
            painter.setPen(QColor("#e91e63"))
            painter.setFont(QFont("Verdana", 48, QFont.Weight.ExtraBold))
            painter.drawText(QRectF(start_x, start_y, grid_size, grid_size), Qt.AlignmentFlag.AlignCenter, self.celebration_message)

    def draw_tile(self, painter, rect, val):
        color = self.colors.get(val, (60, 58, 50))
        painter.setBrush(QBrush(QColor(*color)))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(rect, 5, 5)
        
        if val != 0:
            font_size = 36 if val < 100 else (28 if val < 1000 else 22)
            painter.setPen(QColor("#776e65" if val in (2, 4) else "#f9f6f2"))
            painter.setFont(QFont("Verdana", font_size, QFont.Weight.Bold))
            painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, str(val))

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("2048 Special - Motion & Swipe")
        self.setGeometry(100, 100, 500, 600)
        self.setStyleSheet("background-color: #faf8ef;")
        self.game_widget = GameWidget(self)
        self.setCentralWidget(self.game_widget)
        
    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape: self.close()
        else: self.game_widget.keyPressEvent(event)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
