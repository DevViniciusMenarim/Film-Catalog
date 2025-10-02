const searchForm = document.querySelector("form");
const searchInput = document.querySelector('input[name="movie_query"]');
const resultsContainer = document.querySelector("#results");
const viewFavoritesBtn = document.querySelector("#view-favorites-btn");

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const searchTerm = searchInput.value;
  fetch(`/search?movie_query=${searchTerm}`)
    .then((response) => response.json())
    .then((data) => {
      displayMovies(data.results, 'search');
    });
});

resultsContainer.addEventListener("click", (event) => {
  if (event.target.classList.contains("save-btn")) {
    const tmdb_id = event.target.dataset.movieid;
    const title = event.target.dataset.movietitle;

    fetch("/favorites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tmdb_id: tmdb_id, title: title }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(data.message);
        event.target.textContent = "Saved!";
        event.target.disabled = true;
      });
  } else if (event.target.classList.contains("delete-btn")) {
    const tmdb_id = event.target.dataset.movieid;

    fetch(`/favorites/${tmdb_id}`, {
      method: "DELETE",
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(data.message);
        event.target.closest(".movie-card").remove();
      });
  }
});

viewFavoritesBtn.addEventListener("click", () => {
  fetch("/favorites")
    .then((response) => response.json())
    .then((data) => {
      displayMovies(data, 'favorites');
    });
});

function displayMovies(movies, type = "search") {
  resultsContainer.innerHTML = "";

  movies.forEach((movie) => {
    const posterUrl = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : "https://via.placeholder.com/500x750.png?text=No+Image+Available";

    let buttonsHtml = "";
    if (type === "search") {
      buttonsHtml = `
        <button class="save-btn" data-movieid="${movie.id}" data-movietitle="${movie.title}">
          Save
        </button>`;
    } else {
      buttonsHtml = `
        <button class="delete-btn" data-movieid="${movie.tmdb_id}">
          Delete
        </button>`;
    }

    const movieElement = `
      <div class="movie-card">
        <img src="${posterUrl}" alt="Poster for ${movie.title}">
        <div class="movie-info">
          <h3>${movie.title}</h3>
          <p>${movie.overview}</p>
          ${buttonsHtml}
        </div>
      </div>
    `;
    resultsContainer.innerHTML += movieElement;
  });
}
