import bpy

def automate_multires_displacement_bake():
    # 1. VERIFY ACTIVE OBJECT CONTEXT
    # Ensure the script is targeting a valid mesh object in the viewport
    obj = bpy.context.active_object
    if not obj or obj.type != 'MESH':
        print("ERROR: Please select your retopologized mesh containing the Multires modifier.")
        return

    # 2. ENGINE CONFIGURATION
    # Force GPU compute to accelerate the heavy displacement calculations
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.context.scene.cycles.device = 'GPU'
    
    # Enable the Multires bake architecture (Updated for Blender 5.0 API)
    bpy.context.scene.render.bake.use_multires = True
    
    # 3. SHADER TREE & NODE INJECTION
    # Validate that a material exists to host the destination texture node
    if not obj.data.materials:
        print("ERROR: No material found on the active object. Assign a material first.")
        return
        
    mat = obj.data.materials[0]
    nodes = mat.node_tree.nodes
    
    # Establish naming convention for kitbash/asset library management
    img_name = f"{obj.name}_Displacement_Baked"
    
    # Generate the target image data block if it doesn't exist
    if img_name not in bpy.data.images:
        # CRITICAL: 32-bit float buffer is mandatory for displacement to prevent stepping/banding
        img = bpy.data.images.new(img_name, width=4096, height=4096, alpha=False, float_buffer=True)
        img.colorspace_settings.name = 'Non-Color'
    else:
        img = bpy.data.images[img_name]

    # Scan the node tree to prevent duplicate node generation
    target_node = None
    for node in nodes:
        if node.type == 'TEX_IMAGE' and node.image and node.image.name == img_name:
            target_node = node
            break
            
    # Inject a new Image Texture node if one was not found
    if not target_node:
        target_node = nodes.new('ShaderNodeTexImage')
        target_node.name = "AUTO_DISP_BAKE"
        target_node.image = img
        target_node.location = (-400, -300)
        
    # 4. OVERRIDE UI SELECTION STATES
    # Deselect all nodes to clear conflicts, then explicitly activate the target node for Cycles
    for node in nodes:
        node.select = False
        
    target_node.select = True
    nodes.active = target_node
    
    # 5. BAKE EXECUTION
    print(f"Executing Multires Displacement Bake for: {obj.name}...")
    
    # Fire the Displacement bake process with error handling
    try:
        bpy.ops.object.bake(type='DISPLACEMENT')
        print(f"Bake Complete: Physical depth vectors successfully written to '{img_name}'.")
    except Exception as e:
        print(f"BAKE FAILED: Ensure your Multires modifier is present. Error: {e}")

# Initialize the automation tool
automate_multires_displacement_bake()
