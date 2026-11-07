"use client"

import { useState, useRef, useMemo, useEffect } from "react"
import { ChevronLeft, Camera, Plus, Loader2, X } from "lucide-react"
import { doc, collection, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { uploadProductImage } from "@/lib/cloudinary"
import type { Product } from "@/lib/store-data"

interface AddProductPageProps {
  product?: Product | null
  storeId: string
  storeName: string
  storeAddress: string
  storeCategory: string
  onBack: () => void
  onSave: (product: Omit<Product, "id"> & { id?: string }) => void
}

export function slugifyCategory(label: string): string {
  return label.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "").replace(/^_+|_+$/g, "")
}

const categoryOptions: Record<string, { label: string; key?: string }[]> = {
  food: [{ label: "Fast Food", key: "food" }, { label: "Healthy", key: "food" }, { label: "Snacks", key: "food" }, { label: "Fresh Produce", key: "food" }, { label: "Japanese", key: "food" }, { label: "Desserts", key: "dessert" }, { label: "Drinks", key: "drinks" }, { label: "Other", key: "food" }],
  clothes: ["Men", "Women", "Kids", "Shoes", "Bags & Accessories", "Chitenge & Traditional Wear", "Sportswear", "Underwear & Socks", "Other"].map((label) => ({ label })),
  hardware: ["Building Materials", "Roofing", "Plumbing", "Electrical", "Paint & Finishes", "Tools & Equipment", "Doors Windows & Locks", "Nails Screws & Fasteners", "Garden & Outdoor", "Safety Gear", "Other"].map((label) => ({ label })),
  market: [{ label: "Vegetables", key: "vegetables" }, { label: "Fruits", key: "fruits" }, { label: "Dry Food (beans, groundnuts, kapenta, rice)", key: "dry_food" }, { label: "Utensils", key: "utensils" }, { label: "Baskets & Buckets", key: "baskets_buckets" }, { label: "Shoes", key: "shoes" }, { label: "Garden Items", key: "garden" }, { label: "Household Items", key: "household" }, { label: "Drinks", key: "drinks" }, { label: "Other", key: "other" }],
}

const units = ["item", "bag", "g", "kg", "ml", "L", "pack"]
const clothingImageSlots = [0, 1, 2] as const

function parseUnit(unit?: string | null): { amount: string; type: string } {
  const raw = (unit ?? "").trim()
  if (!raw) return { amount: "1", type: "item" }
  let i = 0
  while (i < raw.length && ((raw[i] >= "0" && raw[i] <= "9") || raw[i] === ".")) i++
  const amount = raw.slice(0, i)
  const type = raw.slice(i).trim()
  if (!amount || Number.isNaN(Number(amount))) return { amount: "1", type: raw }
  return { amount, type: type || "item" }
}

export function AddProductPage({ product, storeId, storeName, storeAddress, storeCategory, onBack, onSave }: AddProductPageProps) {
  const options = useMemo(() => {
    const list = categoryOptions[storeCategory] || categoryOptions.food
    return product?.category && !list.some((option) => option.label === (product.category === "Beverages" ? "Drinks" : product.category)) ? [...list, { label: product.category === "Beverages" ? "Drinks" : product.category }] : list
  }, [storeCategory, product?.category])
  const [name, setName] = useState(product?.name || "")
  const [category, setCategory] = useState(product?.category === "Beverages" ? "Drinks" : product?.category || options[0].label)
  const [price, setPrice] = useState(product?.price?.toString() || "")
  const parsedUnit = parseUnit(product?.unit)
  const [unitAmount, setUnitAmount] = useState(parsedUnit.amount)
  const [unitType, setUnitType] = useState(parsedUnit.type)
  const [description, setDescription] = useState(product?.description || "")
  const [available, setAvailable] = useState(product?.available ?? true)
  const [image, setImage] = useState(product?.image || "")
  const [images, setImages] = useState<string[]>(() => {
    const existing = product?.imageUrls?.length ? product.imageUrls : product?.images?.length ? product.images : product?.image && product.image !== "/images/placeholder.jpg" ? [product.image] : []
    return Array.from({ length: 3 }, (_, i) => existing[i] ?? "")
  })
  const [imageFiles, setImageFiles] = useState<(File | null)[]>([null, null, null])
  const [stock, setStock] = useState(product?.stock?.toString() || "0")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const singleImageInputRef = useRef<HTMLInputElement>(null)
  const imagesRef = useRef(images)
  imagesRef.current = images

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((preview) => {
        if (preview.startsWith("blob:")) URL.revokeObjectURL(preview)
      })
    }
  }, [])

  const handlePhotoChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setImages((current) => {
      const previous = current[index]
      if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous)
      return Array.from({ length: 3 }, (_, itemIndex) => itemIndex === index ? URL.createObjectURL(file) : current[itemIndex] ?? "")
    })
    setImageFiles((current) => Array.from({ length: 3 }, (_, itemIndex) => itemIndex === index ? file : current[itemIndex] ?? null))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setImageFile(file)
    setImage(URL.createObjectURL(file))
  }

  const isEditing = !!product

  const removeClothingImage = (slot: number) => {
    setImages((current) => {
      const previous = current[slot]
      if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous)
      return Array.from({ length: 3 }, (_, index) => index === slot ? "" : current[index] ?? "")
    })
    setImageFiles((current) => Array.from({ length: 3 }, (_, index) => index === slot ? null : current[index] ?? null))
  }

  const handleSave = async () => {
    if (!name.trim() || !price) return

    setError(null)
    setIsSaving(true)

    try {
      // Generate product ID using Firestore document reference
      const productId = product?.id || doc(collection(db, "stores", storeId, "products")).id
      
      let imageUrl = image
      let imageUrls = images.filter(Boolean)
      if (storeCategory === "clothes") {
        if (!imageUrls.length && !imageFiles.some(Boolean)) {
          setError("Add at least one photo")
          setIsSaving(false)
          return
        }

        setIsUploading(true)
        try {
          imageUrls = (await Promise.all(images.map((current, index) => imageFiles[index]
            ? uploadProductImage(imageFiles[index] as File, storeId, productId)
            : current
          ))).filter(Boolean)
        } catch (uploadError) {
          setError("Failed to upload image. Please try again.")
          setIsSaving(false)
          setIsUploading(false)
          return
        }
        setIsUploading(false)
        imageUrl = imageUrls[0]
      }

      // Upload image to Cloudinary if a new file was selected
      if (storeCategory !== "clothes" && imageFile) {
        setIsUploading(true)
        try {
          imageUrl = await uploadProductImage(imageFile, storeId, productId)
        } catch (uploadError) {
          setError("Failed to upload image. Please try again.")
          setIsSaving(false)
          setIsUploading(false)
          return
        }
        setIsUploading(false)
      }

      // Prepare product data for Firestore
      const productData = {
        name: name.trim(),
        price: parseFloat(price) || 0,
        imageUrl: imageUrl === "/images/placeholder.jpg" ? "" : imageUrl || "",
        ...(storeCategory === "clothes" ? { imageUrls } : {}),
        ...(storeCategory === "food" || storeCategory === "market" ? { foodCategory: options.find((option) => option.label === category)?.key } : {}),
        category,
        categoryKey: slugifyCategory(category),
        description: description.trim(),
        unit: `${unitAmount}${unitType}`,
        stockQuantity: parseInt(stock) || 0,
        availability: available,
        storeId,
        storeName,
        storeAddress,
        ...(isEditing ? {} : { createdAt: serverTimestamp() }),
      }

      // Save to Firestore
      await setDoc(doc(db, "stores", storeId, "products", productId), productData, { merge: true })

      // Call onSave callback with the product data for local state update
      onSave({
        id: productId,
        name: name.trim(),
        category,
        price: parseFloat(price) || 0,
        unit: `${unitAmount}${unitType}`,
        description: description.trim(),
        available,
        image: imageUrl || "/images/placeholder.jpg",
        imageUrls: storeCategory === "clothes" ? imageUrls : undefined,
        images: storeCategory === "clothes" ? imageUrls : undefined,
        categoryKey: slugifyCategory(category),
        foodCategory: storeCategory === "food" || storeCategory === "market" ? options.find((option) => option.label === category)?.key : undefined,
        stock: parseInt(stock) || 0,
      })
    } catch (err) {
      console.error("Error saving product:", err)
      setError("Failed to save product. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Fixed Header */}
      <div className="bg-card px-4 pt-5 pb-4 shrink-0 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-card-foreground transition-colors hover:text-primary"
              aria-label="Go back"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-card-foreground">
              {isEditing ? "Edit Product" : "Add New Product"}
            </h1>
          </div>
          <button
            onClick={onBack}
            className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
        <div className="flex flex-col gap-5">
          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/50 rounded-xl p-3 text-destructive text-sm text-center">
              {error}
            </div>
          )}

          {/* Image Upload */}
          {storeCategory === "clothes" ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product Photos</p>
              <div className="grid grid-cols-3 gap-2">
                {clothingImageSlots.map((index) => {
                  const slotImage = images[index] || ""
                  return (
                    <div key={index} className="relative">
                      <div className="relative flex aspect-square w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed border-border bg-card transition-colors hover:bg-accent/50">
                        <input
                          id={`product-photo-${index}`}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoChange(index, e)}
                          disabled={isUploading || isSaving}
                          aria-label={index === 0 ? "Main photo (required)" : `Optional photo ${index + 1}`}
                          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                        />
                        {slotImage ? <img src={slotImage} alt={`${name || "Product"} photo ${index + 1}`} className="pointer-events-none h-full w-full object-cover" /> : <><Camera className="pointer-events-none size-6 text-primary" /><Plus className="pointer-events-none absolute size-3 translate-x-3 -translate-y-3 text-primary" /></>}
                      </div>
                      {slotImage && <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); removeClothingImage(index) }} disabled={isUploading || isSaving} className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm" aria-label={`Remove photo ${index + 1}`}><X className="size-3" /></button>}
                      <p className="mt-1 text-center text-[10px] text-muted-foreground">{index === 0 ? "Main photo (required)" : "Optional"}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => singleImageInputRef.current?.click()}
                disabled={isUploading || isSaving}
                className="relative flex h-36 w-full max-w-xs flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-border bg-card transition-colors hover:bg-accent/50 disabled:cursor-not-allowed"
              >
                {isUploading && <Loader2 className="size-6 animate-spin text-primary" />}
                {image ? <img src={image} alt="Product preview" className="h-full w-full rounded-xl object-cover" /> : <><Camera className="size-6 text-primary" /><span className="text-sm text-muted-foreground">Tap to Upload Image</span></>}
              </button>
              <input ref={singleImageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </div>
          )}

          {/* Product Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Product Name
            </label>
            <input
              type="text"
              placeholder="Enter product name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
              }}
            >
              {options.map((option) => (
                <option key={option.label} value={option.label}>{option.label}</option>
              ))}
            </select>
          </div>

          {/* Price and Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Price (ZMW)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="ZMW 0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Unit
              </label>
              <div className="flex items-center overflow-hidden bg-card border border-border rounded-xl focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="1"
                  value={unitAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 4)
                    setUnitAmount(value)
                  }}
                  className="min-w-0 flex-1 px-4 py-3 bg-transparent text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none"
                  aria-label="Unit amount"
                />
                <select
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value)}
                  className="w-20 shrink-0 border-l border-border bg-transparent px-2 py-3 text-sm text-card-foreground focus:outline-none cursor-pointer"
                  aria-label="Unit type"
                >
              {[...new Set(unitType && !units.includes(unitType) ? [unitType, ...units] : units)].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
                </select>
              </div>
            </div>
          </div>

          {/* Stock */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Stock Quantity
            </label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Description (Optional)
            </label>
            <textarea
              placeholder="Add details about the product..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
            />
          </div>

          {/* Availability Toggle */}
          <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
            <div>
              <p className="text-sm font-semibold text-card-foreground">Availability</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {available ? "Product is Available" : "Product is Out of Stock"}
              </p>
            </div>
            <button
              onClick={() => setAvailable(!available)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ${
                available ? "bg-primary" : "bg-muted-foreground/30"
              }`}
              role="switch"
              aria-checked={available}
              aria-label="Toggle product availability"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-card transition-transform duration-300 shadow-sm ${
                  available ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!name.trim() || !price || isSaving || isUploading}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold transition-all duration-200 active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            {isSaving || isUploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {isUploading ? "Uploading Image..." : "Saving..."}
              </>
            ) : (
              isEditing ? "Update Product" : "Save Product"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
