import random

class GameLogic:
    def __init__(self):
        self.size = 4
        self.score = 0
        self.board = [[0] * self.size for _ in range(self.size)]
        self.max_tile = 0
        self.reset_game()

    def reset_game(self):
        self.board = [[0] * self.size for _ in range(self.size)]
        self.score = 0
        self.max_tile = 0
        self.add_new_tile()
        self.add_new_tile()

    def add_new_tile(self):
        empty_cells = [(r, c) for r in range(self.size) for c in range(self.size) if self.board[r][c] == 0]
        if not empty_cells:
            return None
        r, c = random.choice(empty_cells)
        val = 2 if random.random() < 0.9 else 4
        self.board[r][c] = val
        if val > self.max_tile:
            self.max_tile = val
        return (r, c, val)

    def move(self, direction):
        """
        Moves tiles and returns movement data for animation.
        Returns: (moved, moves_data, new_tile_info, new_record_tile)
        moves_data: list of (from_r, from_c, to_r, to_c, value, is_merged)
        """
        original_board = [row[:] for row in self.board]
        moves_data = []
        new_record = None
        score_increment = 0
        
        # We need to process each row/column based on direction
        if direction in ('LEFT', 'RIGHT'):
            for r in range(self.size):
                row = self.board[r]
                if direction == 'RIGHT':
                    row = row[::-1]
                
                merged_line, line_moves, line_score, line_max = self.process_line(row)
                
                # Convert line_moves back to board coordinates
                for m in line_moves:
                    from_c = m[0] if direction == 'LEFT' else (self.size - 1 - m[0])
                    to_c = m[1] if direction == 'LEFT' else (self.size - 1 - m[1])
                    moves_data.append((r, from_c, r, to_c, m[2], m[3]))
                
                if line_max > self.max_tile:
                    self.max_tile = line_max
                    new_record = line_max
                
                score_increment += line_score
                if direction == 'RIGHT':
                    merged_line = merged_line[::-1]
                self.board[r] = merged_line
        
        else: # UP or DOWN
            for c in range(self.size):
                col = [self.board[r][c] for r in range(self.size)]
                if direction == 'DOWN':
                    col = col[::-1]
                
                merged_line, line_moves, line_score, line_max = self.process_line(col)
                
                for m in line_moves:
                    from_r = m[0] if direction == 'UP' else (self.size - 1 - m[0])
                    to_r = m[1] if direction == 'UP' else (self.size - 1 - m[1])
                    moves_data.append((from_r, c, to_r, c, m[2], m[3]))
                
                if line_max > self.max_tile:
                    self.max_tile = line_max
                    new_record = line_max
                
                score_increment += line_score
                if direction == 'DOWN':
                    merged_line = merged_line[::-1]
                for r in range(self.size):
                    self.board[r][c] = merged_line[r]

        self.score += score_increment
        moved = (self.board != original_board)
        new_tile_info = None
        if moved:
            new_tile_info = self.add_new_tile()
            
        return moved, moves_data, new_tile_info, new_record

    def process_line(self, line):
        """
        line: list of values in a row/col (normalized to move towards index 0)
        Returns: (new_line, moves, score_inc, max_val)
        moves: list of (from_idx, to_idx, value, merged)
        """
        new_line = [0] * self.size
        moves = []
        score_inc = 0
        max_val = 0
        
        # Track where each non-zero element from the original line ends up
        # first, filter non-zeros
        last_merged_idx = -1
        target_idx = 0
        
        for i, val in enumerate(line):
            if val == 0:
                continue
            
            # Can we merge with the previous element in new_line?
            if target_idx > 0 and new_line[target_idx-1] == val and last_merged_idx != target_idx-1:
                # Merge!
                target_idx -= 1
                new_line[target_idx] *= 2
                score_inc += new_line[target_idx]
                if new_line[target_idx] > max_val:
                    max_val = new_line[target_idx]
                moves.append((i, target_idx, val, True))
                last_merged_idx = target_idx
                target_idx += 1
            else:
                # Just move/stay
                new_line[target_idx] = val
                if val > max_val:
                    max_val = val
                moves.append((i, target_idx, val, False))
                target_idx += 1
                
        return new_line, moves, score_inc, max_val

    def check_game_over(self):
        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] == 0: return False
                if r + 1 < self.size and self.board[r][c] == self.board[r+1][c]: return False
                if c + 1 < self.size and self.board[r][c] == self.board[r][c+1]: return False
        return True
