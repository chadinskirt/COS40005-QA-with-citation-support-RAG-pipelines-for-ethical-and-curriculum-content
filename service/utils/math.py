def weighted_sum(weights, values):
    if len(weights) != len(values):
        raise ValueError("Mismatched vector dimensions")

    total_weight = sum(weights)

    if total_weight <= 0:
        raise ValueError("Total weight must be positive")

    return sum(
        w * x for w, x in zip(weights, values)
    ) / total_weight

def min_max_norm(x, x_min, x_max):
    if x_max <= x_min:
        raise ValueError("Invalid range")

    return (x - x_min) / (x_max - x_min)


def scale_norm(x, maximum):
    if maximum <= 0:
        raise ValueError("Invalid maximum")

    return x / maximum

def weighted_geometric(values, weights):
    if len(values) != len(weights):
        raise ValueError("Mismatched vector dimensions")

    total_weight = sum(weights)

    if total_weight <= 0:
        raise ValueError("Invalid weights")

    if any(v < 0 for v in values):
        raise ValueError("Values must be non-negative")

    if any(w < 0 for w in weights):
        raise ValueError("Weights must be non-negative")

    if any(v == 0 and w > 0
           for v, w in zip(values, weights)):
        return 0.0

    import math

    return math.exp(
        sum(
            w * math.log(v)
            for v, w in zip(values, weights)
            if w > 0
        ) / total_weight
    )