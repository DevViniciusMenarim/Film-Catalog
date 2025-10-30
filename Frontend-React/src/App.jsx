import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <div class="controls">
        <form action="/search" method="GET">
          <input
            type="text"
            name="movie_query"
            placeholder="Digite o nome do filme..."
          />
          <button type="submit">Buscar</button>
        </form>
        <button id="view-favorites-btn">View Favorites</button>
      </div>

      <div id="results"></div>
    </div>
  );
}

export default App;
