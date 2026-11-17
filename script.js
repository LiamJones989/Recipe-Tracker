
const API = "https://www.themealdb.com/api/json/v1/1";

const STORAGE = {
    ingredients: "recipeFinder_ingredients",
    favorites: "recipeFinder_favorites"
};

// Load saved information
let ingredients = JSON.parse(
    localStorage.getItem(STORAGE.ingredients) || "[]"
);

let favorites = JSON.parse(
    localStorage.getItem(STORAGE.favorites) || "[]"
);

let recipes = [];

// HTML elements
const ingredientForm = document.getElementById("ingredientForm");
const ingredientInput = document.getElementById("ingredientInput");
const ingredientList = document.getElementById("ingredientList");
const ingredientCount = document.getElementById("ingredientCount");

const findRecipesButton = document.getElementById("findRecipes");
const searchStatus = document.getElementById("searchStatus");

const favoriteRecipes = document.getElementById("favoriteRecipes");
const readyRecipes = document.getElementById("readyRecipes");
const otherRecipes = document.getElementById("otherRecipes");


// Normalize ingredient names for comparison
function normalize(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/_/g, " ")
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .replace(/\b(chilies|berries|tomatoes|potatoes|leaves|loaves)\b/g,
            word => ({
                chilies: "chili",
                berries: "berry",
                tomatoes: "tomato",
                potatoes: "potato",
                leaves: "leaf",
                loaves: "loaf"
            })[word]
        )
        .replace(/\b([a-z]+)s\b/, "$1");
}


// Save ingredients
function saveIngredients() {
    localStorage.setItem(
        STORAGE.ingredients,
        JSON.stringify(ingredients)
    );
}


// Save favorites
function saveFavorites() {
    localStorage.setItem(
        STORAGE.favorites,
        JSON.stringify(favorites)
    );
}


// Display ingredient inventory
function renderIngredients() {
    ingredientList.innerHTML = "";

    ingredientCount.textContent =
        `${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"} saved`;

    if (ingredients.length === 0) {
        ingredientList.innerHTML =
            '<p class="empty-message">Your ingredients will appear here.</p>';
        return;
    }

    ingredients.forEach((ingredient, index) => {
        const tag = document.createElement("div");
        tag.className = "ingredient-tag";

        const name = document.createElement("span");
        name.textContent = ingredient;

        const remove = document.createElement("button");
        remove.className = "remove-ingredient";
        remove.textContent = "×";
        remove.title = "Remove ingredient";

        remove.addEventListener("click", () => {
            ingredients.splice(index, 1);
            saveIngredients();
            renderIngredients();
            renderRecipes();
        });

        tag.append(name, remove);
        ingredientList.appendChild(tag);
    });
}


// Add a new ingredient
ingredientForm.addEventListener("submit", event => {
    event.preventDefault();

    const value = ingredientInput.value.trim();

    if (!value) return;

    const exists = ingredients.some(
        item => normalize(item) === normalize(value)
    );

    if (exists) {
        searchStatus.textContent = "You already have that ingredient.";
        return;
    }

    ingredients.push(value);

    saveIngredients();
    renderIngredients();

    ingredientInput.value = "";
    ingredientInput.focus();

    searchStatus.textContent = "";
    renderRecipes();
});


// Clear ingredients
document.getElementById("clearIngredients").addEventListener("click", () => {
    if (!confirm("Are you sure you want to remove all your ingredients?")) {
        return;
    }

    ingredients = [];

    saveIngredients();
    renderIngredients();
    renderRecipes();
});


// Search recipes online
findRecipesButton.addEventListener("click", searchRecipes);


async function searchRecipes() {
    if (ingredients.length === 0) {
        searchStatus.textContent = "Add some ingredients first!";
        return;
    }

    findRecipesButton.disabled = true;
    findRecipesButton.textContent = "Searching...";
    searchStatus.textContent = "Searching online for recipes...";

    try {
        const ingredientQueries = ingredients.slice(0, 10);

        // Search TheMealDB for each ingredient
        const results = await Promise.all(
            ingredientQueries.map(async ingredient => {
                const url = `${API}/filter.php?i=${encodeURIComponent(ingredient)}`;

                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error("Recipe service unavailable.");
                }

                const data = await response.json();
                return data.meals || [];
            })
        );

        // Combine and remove duplicate recipes
        const uniqueMeals = new Map();

        results.flat().forEach(meal => {
            uniqueMeals.set(meal.idMeal, meal);
        });

        const mealList = Array.from(uniqueMeals.values()).slice(0, 30);

        // Also load saved favorites, even if none of their ingredients
        // are currently in the inventory
        const favoriteIds = favorites.filter(
            id => !uniqueMeals.has(id)
        );

        const favoriteResults = await Promise.all(
            favoriteIds.map(async id => {
                try {
                    const response = await fetch(
                        `${API}/lookup.php?i=${encodeURIComponent(id)}`
                    );

                    const data = await response.json();
                    return data.meals?.[0] || null;
                } catch {
                    return null;
                }
            })
        );

        const allMeals = [
            ...mealList,
            ...favoriteResults.filter(Boolean)
        ];

        // Get complete recipe information
        const detailedRecipes = await Promise.all(
            allMeals.map(async meal => {
                try {
                    const response = await fetch(
                        `${API}/lookup.php?i=${encodeURIComponent(meal.idMeal)}`
                    );

                    const data = await response.json();
                    return data.meals?.[0] || null;
                } catch {
                    return null;
                }
            })
        );

        recipes = detailedRecipes.filter(Boolean);

        renderRecipes();

        searchStatus.textContent =
            `Found ${recipes.length} recipes to explore!`;

    } catch (error) {
        console.error(error);

        searchStatus.textContent =
            "Could not connect to the recipe database. Check your internet connection and try again.";
    } finally {
        findRecipesButton.disabled = false;
        findRecipesButton.textContent = "Find Recipes Online";
    }
}


// Get recipe ingredients and measurements
function getRecipeIngredients(recipe) {
    const result = [];

    for (let i = 1; i <= 20; i++) {
        const ingredient = recipe[`strIngredient${i}`]?.trim();
        const measure = recipe[`strMeasure${i}`]?.trim();

        if (ingredient) {
            result.push({
                name: ingredient,
                measure: measure || ""
            });
        }
    }

    return result;
}


// Check which ingredients you have
function compareIngredients(recipe) {
    const recipeIngredients = getRecipeIngredients(recipe);

    const owned = recipeIngredients.filter(item =>
        ingredients.some(
            userIngredient =>
                normalize(userIngredient) === normalize(item.name)
        )
    );

    const missing = recipeIngredients.filter(item =>
        !ingredients.some(
            userIngredient =>
                normalize(userIngredient) === normalize(item.name)
        )
    );

    return {
        owned,
        missing,
        total: recipeIngredients.length
    };
}


// Render all recipe categories
function renderRecipes() {
    const favoriteList = [];
    const readyList = [];
    const otherList = [];

    recipes.forEach(recipe => {
        const comparison = compareIngredients(recipe);
        const isFavorite = favorites.includes(recipe.idMeal);

        if (isFavorite) {
            favoriteList.push(recipe);
        }

        if (comparison.missing.length === 0) {
            if (!isFavorite) {
                readyList.push(recipe);
            }
        } else if (!isFavorite) {
            otherList.push(recipe);
        }
    });

    // Sort other recipes by fewest missing ingredients
    otherList.sort((a, b) =>
        compareIngredients(a).missing.length -
        compareIngredients(b).missing.length
    );

    renderRecipeSection(favoriteRecipes, favoriteList);
    renderRecipeSection(readyRecipes, readyList);
    renderRecipeSection(otherRecipes, otherList);

    document.getElementById("favoriteCount").textContent =
        favoriteList.length;

    document.getElementById("readyCount").textContent =
        readyList.length;

    document.getElementById("otherCount").textContent =
        otherList.length;
}


// Create recipe cards
function renderRecipeSection(container, recipeList) {
    container.innerHTML = "";

    if (recipeList.length === 0) {
        const message = document.createElement("p");
        message.className = "empty-message";
        message.textContent = "No recipes to show yet.";
        container.appendChild(message);
        return;
    }

    recipeList.forEach(recipe => {
        const comparison = compareIngredients(recipe);

        const card = document.createElement("article");
        card.className = "recipe-card";

        const image = document.createElement("img");
        image.src = recipe.strMealThumb;
        image.alt = recipe.strMeal;
        image.loading = "lazy";

        const content = document.createElement("div");
        content.className = "recipe-content";

        const title = document.createElement("h3");
        title.textContent = recipe.strMeal;

        const category = document.createElement("p");
        category.textContent =
            `${recipe.strCategory || "Recipe"} | ${recipe.strArea || "International"}`;

        const have = document.createElement("p");
        have.className = "available";
        have.textContent =
            `You have ${comparison.owned.length} of ${comparison.total} ingredients.`;

        const missing = document.createElement("p");
        missing.className = "missing";

        if (comparison.missing.length === 0) {
            missing.textContent = "You have everything! Ready to cook.";
            missing.className = "available";
        } else {
            missing.textContent =
                "Still need: " +
                comparison.missing.map(item => item.name).join(", ");
        }

        const actions = document.createElement("div");
        actions.className = "recipe-actions";

        const favoriteButton = document.createElement("button");
        favoriteButton.className = "favorite-button";

        const isFavorite = favorites.includes(recipe.idMeal);

        favoriteButton.textContent = isFavorite
            ? "Remove Favorite"
            : "♥ Favorite";

        favoriteButton.addEventListener("click", () => {
            toggleFavorite(recipe.idMeal);
        });

        const viewButton = document.createElement("button");
        viewButton.className = "view-button";
        viewButton.textContent = "View Recipe";

        viewButton.addEventListener("click", () => {
            window.open(
                recipe.strSource || recipe.strYoutube ||
                `https://www.themealdb.com/meal/${recipe.idMeal}`,
                "_blank",
                "noopener,noreferrer"
            );
        });

        actions.append(favoriteButton, viewButton);

        content.append(
            title,
            category,
            have,
            missing,
            actions
        );

        card.append(image, content);
        container.appendChild(card);
    });
}


// Add or remove favorites
function toggleFavorite(id) {
    if (favorites.includes(id)) {
        favorites = favorites.filter(item => item !== id);
    } else {
        favorites.push(id);
    }

    saveFavorites();
    renderRecipes();
}


// Initial website setup
renderIngredients();
renderRecipes();
